export interface ReliabilityState {
  missedEligibleCallsInCurrentWorkWindow: number;
  reliabilityScore: number;
}

export interface MissedCallDecision {
  autoOffline: boolean;
  scoreDelta: number;
  reason: 'grace_miss' | 'repeat_miss';
}

/**
 * Product rule:
 * - A Listener who is online has declared availability.
 * - The first eligible missed call has no score penalty, but auto-offlines the Listener
 *   so the marketplace does not keep routing calls to someone who may have stepped away.
 * - Repeat misses after the Listener deliberately goes online again can reduce reliability.
 * Thresholds remain configurable as we collect real marketplace data.
 */
export function onEligibleMissedCall(state: ReliabilityState): MissedCallDecision {
  if (state.missedEligibleCallsInCurrentWorkWindow === 0) {
    return { autoOffline: true, scoreDelta: 0, reason: 'grace_miss' };
  }

  return { autoOffline: true, scoreDelta: -5, reason: 'repeat_miss' };
}
