export const LISTENER_TRAINING_MODULES = [
  // Keep the original keys where possible so existing applications can continue
  // their journey while the new modules are added by the completion endpoint.
  'role_boundary',
  'active_listening',
  'what_not_to_say',
  'platform_rules',
  'safety',
  'closing_conversation',
  'scenarios',
] as const;

export type ListenerTrainingModule = (typeof LISTENER_TRAINING_MODULES)[number];

export function isListenerTrainingModule(value: unknown): value is ListenerTrainingModule {
  return typeof value === 'string' && (LISTENER_TRAINING_MODULES as readonly string[]).includes(value);
}

export function listenerTrainingComplete(
  rows: Array<{ module_key: string; status: string; progress_percent: number }>,
): boolean {
  const completed = new Set(
    rows
      .filter((row) => row.status === 'completed' && row.progress_percent === 100)
      .map((row) => row.module_key),
  );
  return LISTENER_TRAINING_MODULES.every((moduleKey) => completed.has(moduleKey));
}
