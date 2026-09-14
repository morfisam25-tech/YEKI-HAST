import { isInternalOwnerTestMode } from '../lib/internal-owner-test.ts';

export interface CreateBridgeCallInput {
  // Stable idempotency key for the external bridge creation request.
  // Every production adapter MUST return the same logical bridge when this
  // callSessionId is retried after a timeout or otherwise ambiguous response.
  callSessionId: string;
  callerDestination: string;
  listenerDestination: string;
  // Must come from the wallet authorization performed for this call.
  // The adapter must enforce this as a hard connected-time cap when the provider supports it.
  maxConnectedSeconds: number;
}

export interface CreateBridgeCallResult {
  providerBridgeId: string;
}

export interface TelephonyProvider {
  // Must be idempotent by input.callSessionId. A retry must never create a
  // second independent bridge for the same application call session.
  createBridgeCall(input: CreateBridgeCallInput): Promise<CreateBridgeCallResult>;
  terminateCall(providerBridgeId: string, reason: string): Promise<void>;
}

export function validateTelephonyEnv(): void {
  const provider = process.env.TELEPHONY_PROVIDER?.trim();
  if (!provider) throw new Error('TELEPHONY_PROVIDER is required');
  if (provider === 'dev') {
    // Real Production is untouched: isInternalOwnerTestMode() always returns false there.
    // A genuinely isolated, fail-closed, token-gated Preview Internal Beta deployment may
    // also use the dev provider, since Vercel Preview builds still run with NODE_ENV=production.
    if (process.env.NODE_ENV === 'production' && !isInternalOwnerTestMode()) {
      throw new Error('dev telephony provider is forbidden in production');
    }
    return;
  }
  throw new Error(`Telephony provider not implemented: ${provider}`);
}

class DevTelephonyProvider implements TelephonyProvider {
  async createBridgeCall(input: CreateBridgeCallInput): Promise<CreateBridgeCallResult> {
    return { providerBridgeId: `dev-${input.callSessionId}` };
  }

  async terminateCall(): Promise<void> {
    // No external call exists in the local adapter.
  }
}

export function getTelephonyProvider(): TelephonyProvider {
  validateTelephonyEnv();
  if (process.env.TELEPHONY_PROVIDER?.trim() === 'dev') return new DevTelephonyProvider();
  throw new Error(`Telephony provider not implemented: ${process.env.TELEPHONY_PROVIDER}`);
}
