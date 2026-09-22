import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeKitClient } from '@cloudflare/realtimekit-react-native';

// W60: thin wrapper around the official RealtimeKit React Native Core SDK
// (@cloudflare/realtimekit-react-native, verified against
// developers.cloudflare.com/realtime/realtimekit/core/ and
// developers.cloudflare.com/realtime/realtimekit/audio-calls/ at the time of
// this branch -- see docs/W60_REALTIMEKIT_MOBILE_MEDIA_MIGRATION.md). Audio
// only: the meeting is joined under a server-issued Preset whose meeting type
// is "Voice" (CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME), which makes every
// video-related SDK call a no-op on Cloudflare's side -- this wrapper never
// calls enableVideo()/enableScreenShare() at all, and no camera permission is
// requested anywhere in this file.
//
// `roomJoined` alone is NOT treated as "media connected" (task section 7):
// this hook only reports `connected` once the local participant's own
// `roomJoined` event has fired AND at least one other participant is present
// in `meeting.participants.joined` -- i.e. real two-party audio is actually
// possible, not merely "the SDK finished initializing" or "the join request
// returned successfully".

// W86: classifies a mediaDevices.getUserMedia() rejection distinctly from a
// network/API error, so the caller/listener call-start UI can show
// "microphone permission denied" or "microphone unavailable" instead of a
// misleading generic/network failure message (see MISSION E).
export function classifyMicrophoneError(error: unknown): 'microphone_permission_denied' | 'microphone_unavailable' {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /permission/i.test(message)) {
    return 'microphone_permission_denied';
  }
  return 'microphone_unavailable';
}

export type RealtimeCallMediaState =
  | 'idle'
  | 'connecting'
  | 'waiting_for_other_participant'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'failed';

// Documented on developers.cloudflare.com/realtime/realtimekit/ (RTKSelf
// roomLeft `state`): left, kicked, ended, rejected, disconnected, failed,
// connected-meeting. `disconnected` is a temporary network loss -- mapped to
// `reconnecting` here rather than `ended`/`failed`, since the SDK keeps
// trying to recover the same room on its own.
function mapRoomLeftState(state: string): RealtimeCallMediaState {
  if (state === 'disconnected') return 'reconnecting';
  if (state === 'kicked' || state === 'rejected' || state === 'failed') return 'failed';
  return 'ended';
}

type RealtimeKitMeeting = {
  join: () => Promise<void>;
  leave: () => Promise<void>;
  self: {
    audioEnabled: boolean;
    enableAudio: () => Promise<void>;
    disableAudio: () => Promise<void>;
    on: (event: string, handler: (...args: any[]) => void) => void;
    off?: (event: string, handler: (...args: any[]) => void) => void;
  };
  participants: {
    joined: {
      size?: number;
      count?: number;
      toArray: () => unknown[];
      on: (event: string, handler: (...args: any[]) => void) => void;
      off?: (event: string, handler: (...args: any[]) => void) => void;
    };
  };
};

function remoteParticipantCount(meeting: RealtimeKitMeeting): number {
  try {
    return meeting.participants.joined.toArray().length;
  } catch {
    return 0;
  }
}

export function useRealtimeVoiceCall() {
  // useRealtimeKitClient() must be called unconditionally per the Rules of
  // Hooks; it is a no-op until initMeeting() below is actually invoked (only
  // done when CALL_MEDIA_PROVIDER=realtimekit -- see CallerClosedBetaScreen /
  // ListenerActiveCallCard).
  const [meeting, initMeeting] = useRealtimeKitClient() as [RealtimeKitMeeting | undefined, (opts: { authToken: string }) => Promise<unknown>];
  const [state, setState] = useState<RealtimeCallMediaState>('idle');
  const [muted, setMuted] = useState(false);
  const meetingRef = useRef<RealtimeKitMeeting | undefined>(undefined);
  meetingRef.current = meeting;

  const evaluateJoinedState = useCallback(() => {
    const current = meetingRef.current;
    if (!current) return;
    setState((prior) => {
      if (prior !== 'connected' && prior !== 'waiting_for_other_participant') return prior;
      return remoteParticipantCount(current) > 0 ? 'connected' : 'waiting_for_other_participant';
    });
  }, []);

  useEffect(() => {
    if (!meeting) return;
    const onRoomJoined = () => {
      setState(remoteParticipantCount(meeting) > 0 ? 'connected' : 'waiting_for_other_participant');
    };
    const onRoomLeft = ({ state: leftState }: { state: string }) => {
      setState(mapRoomLeftState(leftState));
    };
    const onParticipantsChanged = () => evaluateJoinedState();

    meeting.self.on('roomJoined', onRoomJoined);
    meeting.self.on('roomLeft', onRoomLeft);
    meeting.participants.joined.on('participantJoined', onParticipantsChanged);
    meeting.participants.joined.on('participantLeft', onParticipantsChanged);

    return () => {
      meeting.self.off?.('roomJoined', onRoomJoined);
      meeting.self.off?.('roomLeft', onRoomLeft);
      meeting.participants.joined.off?.('participantJoined', onParticipantsChanged);
      meeting.participants.joined.off?.('participantLeft', onParticipantsChanged);
    };
  }, [meeting, evaluateJoinedState]);

  const join = useCallback(async (authToken: string) => {
    setState('connecting');
    try {
      const initialized = (await initMeeting({ authToken })) as RealtimeKitMeeting | undefined;
      const active = initialized ?? meetingRef.current;
      if (!active) { setState('failed'); return; }
      await active.self.disableAudio().catch(() => undefined);
      setMuted(true);
      await active.join();
      // setState() for the real 'connected'/'waiting_for_other_participant'
      // distinction happens in the roomJoined listener above, not here --
      // join() resolving is not itself proof of anything more than "the SDK
      // finished its own join handshake".
      await active.self.enableAudio().catch(() => undefined);
      setMuted(false);
    } catch {
      setState('failed');
    }
  }, [initMeeting]);

  const leave = useCallback(async () => {
    const current = meetingRef.current;
    setState('ended');
    if (!current) return;
    try { await current.leave(); } catch { /* already gone */ }
  }, []);

  const toggleMuted = useCallback(async () => {
    const current = meetingRef.current;
    if (!current) return;
    try {
      if (current.self.audioEnabled) { await current.self.disableAudio(); setMuted(true); }
      else { await current.self.enableAudio(); setMuted(false); }
    } catch { /* leave mic state unchanged on failure */ }
  }, []);

  const remoteParticipantPresent = state === 'connected';

  return { state, muted, remoteParticipantPresent, join, leave, toggleMuted };
}
