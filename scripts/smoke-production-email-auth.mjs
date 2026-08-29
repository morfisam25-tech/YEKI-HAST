import tls from 'node:tls';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (/\r|\n/.test(value)) throw new Error(`${name} contains a line break`);
  return value;
}

function normalizedEmail(value) {
  const email = value.trim().toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]?.includes('.') || /\s|[\r\n]/.test(email)) {
    throw new Error('PRODUCTION_SMTP_USERNAME must be an email address for the E2E mailbox');
  }
  return email;
}

function imapQuote(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function imapDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getUTCDate()}-${months[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

function waitForData(socket, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('imap_timeout')); }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const onData = (chunk) => { cleanup(); resolve(chunk); };
    const onError = (error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error('imap_connection_closed')); };
    socket.once('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

class ImapConnection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.counter = 0;
    socket.setTimeout(20_000);
  }

  async readGreeting() {
    await this.readUntilLine(() => true);
  }

  async readUntilLine(predicate) {
    for (;;) {
      const text = this.buffer.toString('utf8');
      let offset = 0;
      for (;;) {
        const index = text.indexOf('\r\n', offset);
        if (index < 0) break;
        const line = text.slice(offset, index);
        if (predicate(line)) {
          this.buffer = Buffer.from(text.slice(index + 2), 'utf8');
          return line;
        }
        offset = index + 2;
      }
      const chunk = await waitForData(this.socket);
      this.buffer = Buffer.concat([this.buffer, chunk]);
    }
  }

  async command(command) {
    const tag = `a${++this.counter}`;
    this.socket.write(`${tag} ${command}\r\n`);
    let collected = Buffer.alloc(0);
    for (;;) {
      const combined = Buffer.concat([collected, this.buffer]);
      const text = combined.toString('utf8');
      const marker = new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)[^\\r\\n]*\\r\\n`);
      const match = marker.exec(text);
      if (match) {
        const end = match.index + match[0].length;
        const consumed = Buffer.from(text.slice(0, end), 'utf8');
        const remainder = Buffer.from(text.slice(end), 'utf8');
        this.buffer = remainder;
        if (match[1] !== 'OK') throw new Error(`imap_command_${match[1].toLowerCase()}`);
        return consumed.toString('utf8');
      }
      collected = combined;
      this.buffer = Buffer.alloc(0);
      const chunk = await waitForData(this.socket);
      this.buffer = Buffer.concat([this.buffer, chunk]);
    }
  }

  close() {
    this.socket.destroy();
  }
}

async function connectImap(username, password) {
  const socket = tls.connect({
    host: 'imap.gmail.com',
    port: 993,
    servername: 'imap.gmail.com',
    rejectUnauthorized: true,
  });
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('secureConnect', onConnect);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
    };
    const onConnect = () => { cleanup(); resolve(); };
    const onError = (error) => { cleanup(); reject(error); };
    const onTimeout = () => { cleanup(); reject(new Error('imap_timeout')); };
    socket.setTimeout(20_000);
    socket.once('secureConnect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });

  const imap = new ImapConnection(socket);
  await imap.readGreeting();
  await imap.command(`LOGIN ${imapQuote(username)} ${imapQuote(password)}`);
  await imap.command('SELECT INBOX');
  return imap;
}

function extractFreshOtp(rawMessage, email, startedAt) {
  const lower = rawMessage.toLowerCase();
  if (!lower.includes(`to: <${email}>`) && !lower.includes(`to: ${email}`)) return null;
  const dateHeader = rawMessage.match(/^Date:\s*(.+)$/mi)?.[1]?.trim();
  const messageTime = dateHeader ? Date.parse(dateHeader) : NaN;
  if (!Number.isFinite(messageTime) || messageTime < startedAt - 30_000) return null;
  return rawMessage.match(/کد ورود شما:\s*(\d{6})/)?.[1] ?? null;
}

async function waitForOtp(imap, email, startedAt) {
  const since = imapDate(new Date(startedAt - 60_000));
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    const search = await imap.command(`SEARCH SINCE ${since} TO ${imapQuote(email)}`);
    const ids = search.match(/\* SEARCH([^\r\n]*)/i)?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
    for (const id of ids.slice(-12).reverse()) {
      const fetched = await imap.command(`FETCH ${id} (BODY.PEEK[])`);
      const code = extractFreshOtp(fetched, email, startedAt);
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error('fresh production OTP email was not observed over IMAP');
}

async function jsonRequest(url, init, expectedStatus) {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  let body = null;
  try { body = await response.json(); } catch {}
  if (response.status !== expectedStatus) {
    throw new Error(`production auth request failed with status ${response.status}`);
  }
  return body;
}

const base = required('API_PRODUCTION_URL').replace(/\/$/, '');
if (!base.startsWith('https://')) throw new Error('API_PRODUCTION_URL must use HTTPS');
const email = normalizedEmail(required('PRODUCTION_SMTP_USERNAME'));
const mailboxPassword = required('PRODUCTION_SMTP_PASSWORD');
const startedAt = Date.now();

await jsonRequest(`${base}/v1/auth/email/request`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email }),
}, 202);

const imap = await connectImap(email, mailboxPassword);
let code;
try {
  code = await waitForOtp(imap, email, startedAt);
  await imap.command('LOGOUT').catch(() => undefined);
} finally {
  imap.close();
}

const verified = await jsonRequest(`${base}/v1/auth/email/verify`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, code }),
}, 200);

const token = typeof verified?.token === 'string' ? verified.token : '';
if (!token || verified?.authMethod !== 'email_otp') throw new Error('production email verify returned an invalid session');

const session = await jsonRequest(`${base}/v1/auth/session`, {
  method: 'GET',
  headers: { authorization: `Bearer ${token}` },
}, 200);
if (session?.ok !== true || typeof session?.userId !== 'string') throw new Error('production session smoke failed');

await jsonRequest(`${base}/v1/auth/logout`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
}, 200);

const revoked = await fetch(`${base}/v1/auth/session`, {
  method: 'GET',
  headers: { authorization: `Bearer ${token}` },
  cache: 'no-store',
});
if (revoked.status !== 401) throw new Error(`revoked production session remained usable (${revoked.status})`);

code = undefined;
console.log('production Email OTP delivery + verify + session + logout E2E PASS (secrets hidden)');
