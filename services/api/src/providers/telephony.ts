export interface CreateBridgeCallInput {
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
  createBridgeCall(input: CreateBridgeCallInput): Promise<CreateBridgeCallResult>;
  terminateCall(providerBridgeId: string, reason: string): Promise<void>;
}

export function getTelephonyProvider(): TelephonyProvider {
  throw new Error('TelephonyProvider adapter is not configured yet');
}
