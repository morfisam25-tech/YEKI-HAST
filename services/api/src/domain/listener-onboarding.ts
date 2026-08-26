export const LISTENER_TRAINING_MODULES = [
  'active_listening',
  'role_boundary',
  'safety',
  'platform_rules',
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
