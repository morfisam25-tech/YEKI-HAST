'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeKitClient } from '@cloudflare/realtimekit-react';

// W63: thin wrapper around the official Cloudflare RealtimeKit React SDK
// (@cloudflare/realtimekit-react, verified against
// developers.cloudflare.com/realtime/realtimekit/core/ and
// docs.realtime.cloudflare.com/guides/live-video/client-setup/react at the
// time of this branch -- see
// docs/W63_WEB_REALTIMEKIT_RELEASE_P0_CLOSURE.md). This is the exact same
// underlying RealtimeKit core the W60 mobile migration uses
// (@cloudflare/realtimekit-react-native) via a different platform binding --
// same events, same documented `roomLeft` state values, same "audio-only is a
// server-side Preset, not a client flag" model. This wrapper is a deliberate,
// near-literal port of apps/mobile/src/realtime-media.ts so Web and Mobile
// share one call-media-state model end to end, not two independently
// invented ones.
//
// Audio only: the meeting is joined under the same server-issued Preset whose
// meeting type is "Voice" (CLOUDFLARE_REALTIMEKIT_VOICE_PRESET_NAME) that
// mobile joins. This wrapper never calls enableVideo()/enableScreenShare();
// no camera permission is ever requested by this file.
//
// `roomJoined` alone is NOT treated as "media connected": this hook only
// reports `connected` once the local participant's own `roomJoined` event has
// fired AND at least one other participant is present in
// `meeting.participants.joined` -- real two-party audio must actually be
// possible, never merely "the SDK finished initializing", "a token was
// minted", or "join() resolved".

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
// connected-meeting -- identical core-SDK contract to the mobile hook's own
// mapRoomLeftState (same underlying @cloudflare/realtimekit core package).
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
  // done when the server reports mediaProvider === 'realtimekit' for this
  // call -- see apps/web/app/talk/page.tsx / apps/web/app/listener/work/page.tsx).
  const [meeting, initMeeting] = useRealtimeKitClient() as unknown as [
    RealtimeKitMeeting | undefined,
    (opts: { authToken: string; defaults?: { audio?: boolean; video?: boolean } }) => Promise<unknown>,
  ];
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
      // defaults: { audio: false } -- start muted, matching the existing
      // "grant microphone only after explicit accept" invariant; the SDK
      // itself requests microphone permission during join(), not this file.
      const initialized = (await initMeeting({ authToken, defaults: { audio: false, video: false } })) as RealtimeKitMeeting | undefined;
      const active = initialized ?? meetingRef.current;
      if (!active) { setState('failed'); return; }
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
