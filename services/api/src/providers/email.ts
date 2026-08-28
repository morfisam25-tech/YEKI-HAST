import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';

export interface SendLoginCodeInput {
  email: string;
  code: string;
  ttlSeconds: number;
}

export interface EmailProvider {
  sendLoginCode(input: SendLoginCodeInput): Promise<void>;
}

type AnySocket = net.Socket | tls.TLSSocket;

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function normalizeEmailAddress(input: string): string {
  const email = input.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) throw new Error('invalid_email');
  if (/\s|[\r\n]/.test(email)) throw new Error('invalid_email');
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes('.')) throw new Error('invalid_email');
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(parts[0])) throw new Error('invalid_email');
  if (!/^[a-z0-9.-]+$/i.test(parts[1]) || parts[1].startsWith('.') || parts[1].endsWith('.')) {
    throw new Error('invalid_email');
  }
  return email;
}

function smtpConfig(): SmtpConfig {
  const host = required('SMTP_HOST');
  const port = Number(required('SMTP_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT is invalid');
  const secureRaw = required('SMTP_SECURE').toLowerCase();
  if (!['true', 'false'].includes(secureRaw)) throw new Error('SMTP_SECURE must be true or false');
  const username = required('SMTP_USERNAME');
  const password = required('SMTP_PASSWORD');
  const fromEmail = normalizeEmailAddress(required('SMTP_FROM_EMAIL'));
  const fromName = (process.env.SMTP_FROM_NAME?.trim() || 'Yeki Hast').replace(/[\r\n]/g, ' ').slice(0, 80);
  return { host, port, secure: secureRaw === 'true', username, password, fromEmail, fromName };
}

export function validateEmailProviderEnv(): void {
  const provider = process.env.EMAIL_PROVIDER?.trim();
  if (!provider) throw new Error('EMAIL_PROVIDER is required');
  if (provider === 'dev') {
    if (process.env.NODE_ENV === 'production') throw new Error('dev email provider is forbidden in production');
    return;
  }
  if (provider === 'smtp') {
    smtpConfig();
    return;
  }
  throw new Error(`Email provider not implemented: ${provider}`);
}

function waitForSocketEvent(socket: AnySocket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      socket.off('timeout', onTimeout);
    };
    const onData = (chunk: Buffer) => { cleanup(); resolve(chunk); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error('smtp_connection_closed')); };
    const onTimeout = () => { cleanup(); reject(new Error('smtp_timeout')); };
    socket.once('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
    socket.once('timeout', onTimeout);
  });
}

class SmtpConnection {
  private buffer = '';

  constructor(private socket: AnySocket) {
    this.socket.setTimeout(10_000);
  }

  replaceSocket(socket: AnySocket) {
    this.socket = socket;
    this.socket.setTimeout(10_000);
    this.buffer = '';
  }

  writeLine(line: string) {
    this.socket.write(`${line}\r\n`);
  }

  writeRaw(value: string) {
    this.socket.write(value);
  }

  async reply(): Promise<{ code: number; text: string }> {
    const lines: string[] = [];
    for (;;) {
      let lineBreak = this.buffer.indexOf('\r\n');
      while (lineBreak >= 0) {
        const line = this.buffer.slice(0, lineBreak);
        this.buffer = this.buffer.slice(lineBreak + 2);
        lines.push(line);
        const match = line.match(/^(\d{3})([ -])/);
        if (match?.[2] === ' ') {
          return { code: Number(match[1]), text: lines.join('\n') };
        }
        lineBreak = this.buffer.indexOf('\r\n');
      }
      const chunk = await waitForSocketEvent(this.socket);
      this.buffer += chunk.toString('utf8');
    }
  }

  async expect(codes: number[]): Promise<{ code: number; text: string }> {
    const result = await this.reply();
    if (!codes.includes(result.code)) throw new Error(`smtp_unexpected_${result.code}`);
    return result;
  }

  getSocket(): AnySocket {
    return this.socket;
  }
}

function connectPlain(host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(10_000);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('smtp_timeout')));
  });
}

function connectTls(host: string, port: number, socket?: net.Socket): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ host, port, socket, servername: host, rejectUnauthorized: true });
    secureSocket.setTimeout(10_000);
    secureSocket.once('secureConnect', () => resolve(secureSocket));
    secureSocket.once('error', reject);
    secureSocket.once('timeout', () => reject(new Error('smtp_timeout')));
  });
}

function encodedHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function dotStuff(value: string): string {
  return value.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

class SmtpEmailProvider implements EmailProvider {
  constructor(private readonly config: SmtpConfig) {}

  async sendLoginCode(input: SendLoginCodeInput): Promise<void> {
    const recipient = normalizeEmailAddress(input.email);
    let socket: AnySocket | null = null;
    try {
      socket = this.config.secure
        ? await connectTls(this.config.host, this.config.port)
        : await connectPlain(this.config.host, this.config.port);
      const smtp = new SmtpConnection(socket);
      await smtp.expect([220]);
      smtp.writeLine('EHLO yeki-hast');
      await smtp.expect([250]);

      if (!this.config.secure) {
        smtp.writeLine('STARTTLS');
        await smtp.expect([220]);
        const upgraded = await connectTls(this.config.host, this.config.port, smtp.getSocket() as net.Socket);
        socket = upgraded;
        smtp.replaceSocket(upgraded);
        smtp.writeLine('EHLO yeki-hast');
        await smtp.expect([250]);
      }

      smtp.writeLine('AUTH LOGIN');
      await smtp.expect([334]);
      smtp.writeLine(Buffer.from(this.config.username, 'utf8').toString('base64'));
      await smtp.expect([334]);
      smtp.writeLine(Buffer.from(this.config.password, 'utf8').toString('base64'));
      await smtp.expect([235]);

      smtp.writeLine(`MAIL FROM:<${this.config.fromEmail}>`);
      await smtp.expect([250]);
      smtp.writeLine(`RCPT TO:<${recipient}>`);
      await smtp.expect([250, 251]);
      smtp.writeLine('DATA');
      await smtp.expect([354]);

      const minutes = Math.max(1, Math.ceil(input.ttlSeconds / 60));
      const subject = encodedHeader('کد ورود یکی هست');
      const fromName = encodedHeader(this.config.fromName);
      const body = [
        `کد ورود شما: ${input.code}`,
        '',
        `این کد تا ${minutes} دقیقه معتبر است.`,
        'اگر این درخواست را شما انجام نداده‌اید، این ایمیل را نادیده بگیرید.',
      ].join('\r\n');
      const messageIdDomain = this.config.fromEmail.split('@')[1];
      const message = [
        `From: ${fromName} <${this.config.fromEmail}>`,
        `To: <${recipient}>`,
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <${randomUUID()}@${messageIdDomain}>`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        body,
      ].join('\r\n');
      smtp.writeRaw(`${dotStuff(message)}\r\n.\r\n`);
      await smtp.expect([250]);
      smtp.writeLine('QUIT');
      await smtp.expect([221]).catch(() => undefined);
    } finally {
      socket?.destroy();
    }
  }
}

class DevEmailProvider implements EmailProvider {
  async sendLoginCode(): Promise<void> {
    // Local development exposes the code only through the guarded API response.
  }
}

export function getEmailProvider(): EmailProvider {
  validateEmailProviderEnv();
  const provider = process.env.EMAIL_PROVIDER?.trim();
  if (provider === 'dev') return new DevEmailProvider();
  if (provider === 'smtp') return new SmtpEmailProvider(smtpConfig());
  throw new Error(`Email provider not implemented: ${provider}`);
}
