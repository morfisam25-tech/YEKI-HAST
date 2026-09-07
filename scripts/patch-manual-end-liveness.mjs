import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one match, found ${count}`);
  await writeFile(path, source.replace(before, after));
}

await replaceOnce(
  'services/api/src/services/internet-voice-lifecycle.ts',
  `  safety?: boolean;\n  endedReason?: string;\n`,
  `  safety?: boolean;\n  endedReason?: string;\n  effectiveEndAt?: string | null;\n`,
);

await replaceOnce(
  'services/api/src/services/internet-voice-lifecycle.ts',
  `             CASE\n               WHEN connected_at IS NULL THEN 0\n               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - connected_at)))::int)\n             END AS connected_seconds,\n             billable_seconds, caller_charge_minor::text,\n             listener_earning_minor::text\n      FROM app.call_sessions\n      WHERE id=$1\n      FOR UPDATE\n    \`, [input.callId]);`,
  `             CASE\n               WHEN connected_at IS NULL THEN 0\n               ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (\n                 LEAST(now(), COALESCE($2::timestamptz, now())) - connected_at\n               )))::int)\n             END AS connected_seconds,\n             billable_seconds, caller_charge_minor::text,\n             listener_earning_minor::text\n      FROM app.call_sessions\n      WHERE id=$1\n      FOR UPDATE\n    \`, [input.callId, input.effectiveEndAt ?? null]);`,
);

await replaceOnce(
  'services/api/src/services/internet-voice-lifecycle.ts',
  `      endedByRole: input.endedByRole,\n      connectedSecondsObserved: boundedConnectedSeconds,\n`,
  `      endedByRole: input.endedByRole,\n      effectiveEndAt: input.effectiveEndAt ?? null,\n      connectedSecondsObserved: boundedConnectedSeconds,\n`,
);

await replaceOnce(
  'services/api/src/routes/internet-voice-end.ts',
  `    if (row.status !== 'connected') throw new HttpError(409, 'call_not_live');\n    return { kind: 'connected' as const, role, status: row.status, safetyEventId };\n`,
  `    if (row.status !== 'connected') throw new HttpError(409, 'call_not_live');\n\n    // Billing cutoff must never trust a timestamp or role supplied by the ending client.\n    // Only an unresolved disconnect signal emitted by the authenticated counterparty can\n    // move the effective end earlier than this request's server time. A later reconnected\n    // signal from that same counterparty clears the cutoff.\n    const disconnect = await client.query<{ effective_end_at: string | null }>(\`\n      SELECT min(reconnecting.created_at)::text AS effective_end_at\n      FROM app.internet_voice_signals reconnecting\n      WHERE reconnecting.call_session_id=$1\n        AND reconnecting.sender_role <> $2\n        AND reconnecting.signal_kind='reconnecting'\n        AND NOT EXISTS (\n          SELECT 1\n          FROM app.internet_voice_signals recovered\n          WHERE recovered.call_session_id=reconnecting.call_session_id\n            AND recovered.sender_role=reconnecting.sender_role\n            AND recovered.signal_kind='reconnected'\n            AND recovered.created_at > reconnecting.created_at\n        )\n    \`, [input.callId, role]);\n\n    return {\n      kind: 'connected' as const,\n      role,\n      status: row.status,\n      safetyEventId,\n      effectiveEndAt: disconnect.rows[0]?.effective_end_at ?? null,\n    };\n`,
);

await replaceOnce(
  'services/api/src/routes/internet-voice-end.ts',
  `      safety,\n      endedReason,\n    });\n`,
  `      safety,\n      endedReason,\n      effectiveEndAt: prepared.effectiveEndAt,\n    });\n`,
);

await replaceOnce(
  'apps/mobile/src/CallerClosedBetaScreen.tsx',
  `    peer.onconnectionstatechange = () => {\n      if (peer.connectionState === 'connected') void postMediaConnected(callId);\n      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') setVoiceReady(false);\n    };\n`,
  `    peer.onconnectionstatechange = () => {\n      if (peer.connectionState === 'connected') {\n        void postInternetVoiceSignal(token, callId, 'reconnected', { source: 'peer_connection_state' }).catch(() => undefined);\n        void postMediaConnected(callId);\n      }\n      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {\n        void postInternetVoiceSignal(token, callId, 'reconnecting', { source: 'peer_connection_state' }).catch(() => undefined);\n      }\n      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') setVoiceReady(false);\n    };\n`,
);

await replaceOnce(
  'apps/mobile/src/CallerClosedBetaScreen.tsx',
  `    if (signal.kind === 'media_connected') {\n      processedSignalIdsRef.current.add(signal.id);\n    }\n`,
  `    if (signal.kind === 'media_connected' || signal.kind === 'reconnecting' || signal.kind === 'reconnected') {\n      processedSignalIdsRef.current.add(signal.id);\n    }\n`,
);

await replaceOnce(
  'apps/mobile/src/ListenerActiveCallCard.tsx',
  `      peer.onconnectionstatechange = () => {\n        if (peer.connectionState === 'connected') void postMediaConnected(activeCall.callId);\n        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') setVoiceReady(false);\n      };\n`,
  `      peer.onconnectionstatechange = () => {\n        if (peer.connectionState === 'connected') {\n          void postInternetVoiceSignal(token, activeCall.callId, 'reconnected', { source: 'peer_connection_state' }).catch(() => undefined);\n          void postMediaConnected(activeCall.callId);\n        }\n        if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {\n          void postInternetVoiceSignal(token, activeCall.callId, 'reconnecting', { source: 'peer_connection_state' }).catch(() => undefined);\n        }\n        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') setVoiceReady(false);\n      };\n`,
);

await replaceOnce(
  'apps/mobile/src/ListenerActiveCallCard.tsx',
  `    if (signal.kind === 'media_connected') processedSignalIdsRef.current.add(signal.id);\n`,
  `    if (signal.kind === 'media_connected' || signal.kind === 'reconnecting' || signal.kind === 'reconnected') {\n      processedSignalIdsRef.current.add(signal.id);\n    }\n`,
);

await replaceOnce(
  'apps/web/app/talk/page.tsx',
  `    pc.onconnectionstatechange = () => {\n      if (pc.connectionState === 'connected') void markMediaConnected();\n      if (pc.connectionState === 'disconnected') setNotice('اتصال ضعیف شده؛ در حال تلاش برای برگشت…');\n      if (pc.connectionState === 'failed') setError('اتصال صوتی قطع شد. تماس را پایان بده و دوباره تلاش کن.');\n    };\n`,
  `    pc.onconnectionstatechange = () => {\n      if (pc.connectionState === 'connected') {\n        void api(\`calls/\${id}/voice/signals\`, {\n          method: 'POST',\n          body: JSON.stringify({ kind: 'reconnected', payload: { source: 'peer_connection_state' } }),\n        }).catch(() => undefined);\n        void markMediaConnected();\n      }\n      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {\n        void api(\`calls/\${id}/voice/signals\`, {\n          method: 'POST',\n          body: JSON.stringify({ kind: 'reconnecting', payload: { source: 'peer_connection_state' } }),\n        }).catch(() => undefined);\n      }\n      if (pc.connectionState === 'disconnected') setNotice('اتصال ضعیف شده؛ در حال تلاش برای برگشت…');\n      if (pc.connectionState === 'failed') setError('اتصال صوتی قطع شد. تماس را پایان بده و دوباره تلاش کن.');\n    };\n`,
);

await replaceOnce(
  'apps/web/app/listener/work/page.tsx',
  `      pc.onconnectionstatechange = () => {\n        if (pc.connectionState === 'connected') void markMediaConnected(activeCall.callId);\n        if (pc.connectionState === 'disconnected') setNotice('اتصال ضعیف شده؛ در حال تلاش برای برگشت…');\n        if (pc.connectionState === 'failed') setError('اتصال صوتی قطع شد. پایان تماس را بزن و وضعیت را تازه کن.');\n      };\n`,
  `      pc.onconnectionstatechange = () => {\n        if (pc.connectionState === 'connected') {\n          void api(\`calls/\${activeCall.callId}/voice/signals\`, {\n            method: 'POST',\n            body: JSON.stringify({ kind: 'reconnected', payload: { source: 'peer_connection_state' } }),\n          }).catch(() => undefined);\n          void markMediaConnected(activeCall.callId);\n        }\n        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {\n          void api(\`calls/\${activeCall.callId}/voice/signals\`, {\n            method: 'POST',\n            body: JSON.stringify({ kind: 'reconnecting', payload: { source: 'peer_connection_state' } }),\n          }).catch(() => undefined);\n        }\n        if (pc.connectionState === 'disconnected') setNotice('اتصال ضعیف شده؛ در حال تلاش برای برگشت…');\n        if (pc.connectionState === 'failed') setError('اتصال صوتی قطع شد. پایان تماس را بزن و وضعیت را تازه کن.');\n      };\n`,
);

const test = `import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { readFile } from 'node:fs/promises';\n\nconst lifecycle = await readFile(new URL('../services/api/src/services/internet-voice-lifecycle.ts', import.meta.url), 'utf8');\nconst endRoute = await readFile(new URL('../services/api/src/routes/internet-voice-end.ts', import.meta.url), 'utf8');\nconst mobileCaller = await readFile(new URL('../apps/mobile/src/CallerClosedBetaScreen.tsx', import.meta.url), 'utf8');\nconst mobileListener = await readFile(new URL('../apps/mobile/src/ListenerActiveCallCard.tsx', import.meta.url), 'utf8');\nconst webCaller = await readFile(new URL('../apps/web/app/talk/page.tsx', import.meta.url), 'utf8');\nconst webListener = await readFile(new URL('../apps/web/app/listener/work/page.tsx', import.meta.url), 'utf8');\n\ntest('manual connected-call settlement accepts only an internal server-derived effective end', () => {\n  assert.match(lifecycle, /effectiveEndAt\\?: string \\| null/);\n  assert.match(lifecycle, /LEAST\\(now\\(\\), COALESCE\\(\\$2::timestamptz, now\\(\\)\\)\\)/);\n  assert.match(endRoute, /effectiveEndAt: prepared\\.effectiveEndAt/);\n  const requestBody = endRoute.match(/const body = await readJson<[\\s\\S]*?>\\(req\\);/)?.[0] ?? '';\n  assert.doesNotMatch(requestBody, /effectiveEndAt/);\n});\n\ntest('manual end trusts only an unresolved counterparty reconnecting signal as an earlier cutoff', () => {\n  assert.match(endRoute, /FROM app\\.internet_voice_signals reconnecting/);\n  assert.match(endRoute, /reconnecting\\.sender_role <> \\$2/);\n  assert.match(endRoute, /reconnecting\\.signal_kind='reconnecting'/);\n  assert.match(endRoute, /recovered\\.sender_role=reconnecting\\.sender_role/);\n  assert.match(endRoute, /recovered\\.signal_kind='reconnected'/);\n  assert.match(endRoute, /recovered\\.created_at > reconnecting\\.created_at/);\n});\n\ntest('all live WebRTC clients publish reconnecting and reconnected state to the authenticated signaling route', () => {\n  for (const source of [mobileCaller, mobileListener, webCaller, webListener]) {\n    assert.match(source, /connectionState === 'disconnected' \\|\\| .*connectionState === 'failed'/);\n    assert.match(source, /'reconnecting'/);\n    assert.match(source, /'reconnected'/);\n    assert.match(source, /source: 'peer_connection_state'/);\n  }\n});\n`;
await writeFile('tests/internet-voice-manual-end-liveness.test.ts', test);
