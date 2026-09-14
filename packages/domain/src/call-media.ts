// W60: which media transport a call's live audio actually flows over. Kept
// separate from packages/domain/src/recording.ts's RecordingPolicy: this is a
// transport-layer decision (can the client even reach a provider that
// RealtimeKit-side recording can attach to), while RecordingPolicy is a
// recording-layer decision (is recording required for this call at all).
// Production always needs both together per locked product policy, but the
// two fail-closed checks are intentionally independent so neither can be
// satisfied by accident through the other's configuration.

export type CallMediaProvider = 'realtimekit' | 'legacy_p2p';

export type CallMediaEnvironment = 'production' | 'preview_internal_beta' | 'local';

// Fail-closed, same shape as recording.ts#resolveRecordingRequirement:
// - Production accepts only an explicit 'realtimekit'. Anything else (unset,
//   or the legacy value) throws -- Production must never silently fall back
//   to the legacy P2P path, which cannot feed RealtimeKit-side recording.
// - Preview/local requires an explicit value too (no implicit default), but
//   either value is accepted there: legacy_p2p keeps the Internal Preview
//   technical-beta path usable while live RealtimeKit credentials are not
//   yet available (see task section 9 / docs/W60 report "Preview legacy
//   behavior").
export function resolveCallMediaProvider(input: {
  environment: CallMediaEnvironment;
  explicitProvider: string | null;
}): CallMediaProvider {
  const normalized = input.explicitProvider?.trim().toLowerCase() || null;

  if (input.environment === 'production') {
    if (normalized !== 'realtimekit') {
      throw new Error('call_media_provider_must_be_realtimekit_in_production');
    }
    return 'realtimekit';
  }

  if (normalized === 'realtimekit') return 'realtimekit';
  if (normalized === 'legacy_p2p') return 'legacy_p2p';
  throw new Error('call_media_provider_not_configured');
}
