-- W60 RealtimeKit mobile media migration.
--
-- Purely additive. One row per call: the RealtimeKit "meeting" a call's live
-- audio (and, when recording is required, its W58 recording) both attach to.
-- Deliberately separate from private_data.call_recording_sessions (0010):
-- that table only exists once both-party recording *consent* has been
-- recorded, and is about recording evidence. This table is about the media
-- *transport* and must exist as soon as either participant needs to join,
-- independent of whether recording is required for this particular call
-- (see services/api/src/services/call-media-session.ts).

CREATE TABLE IF NOT EXISTS app.call_media_sessions (
  call_session_id uuid PRIMARY KEY REFERENCES app.call_sessions(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_meeting_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER call_media_sessions_set_updated_at
BEFORE UPDATE ON app.call_media_sessions
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
