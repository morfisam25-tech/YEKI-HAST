import { API_BASE_URL } from './api';

export class ListenerAgreementApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function getListenerAgreementErrorCode(error: unknown): string {
  return error instanceof ListenerAgreementApiError ? error.code : 'network_error';
}

export async function acceptListenerAgreement(token: string): Promise<{
  ok: true;
  applicationId: string;
  status: string;
  idempotent: boolean;
  agreementVersion: string;
}> {
  const response = await fetch(`${API_BASE_URL}/v1/listener/agreement`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ accepted: true }),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const code = payload && typeof payload.error === 'string' ? payload.error : 'request_failed';
    throw new ListenerAgreementApiError(code, response.status);
  }
  if (!payload || payload.ok !== true || typeof payload.status !== 'string') {
    throw new ListenerAgreementApiError('invalid_response', 502);
  }
  return payload as {
    ok: true;
    applicationId: string;
    status: string;
    idempotent: boolean;
    agreementVersion: string;
  };
}
