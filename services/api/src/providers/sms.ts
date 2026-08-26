export interface SmsProvider {
  sendOtp(input: { phoneE164: string; code: string; ttlSeconds: number }): Promise<void>;
}

class DevSmsProvider implements SmsProvider {
  async sendOtp(): Promise<void> {
    // Deliberately no console logging of OTPs. In local development the API can return
    // devCode only when DEV_EXPOSE_OTP=true and NODE_ENV is not production.
  }
}

export function getSmsProvider(): SmsProvider {
  const provider = process.env.SMS_PROVIDER ?? 'dev';
  if (provider === 'dev') return new DevSmsProvider();
  throw new Error(`SMS provider not implemented: ${provider}`);
}
