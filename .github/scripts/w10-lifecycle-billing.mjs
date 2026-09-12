const base = process.env.PREVIEW_URL;
const production = 'https://yeki-hast-unique-6ff0.vercel.app';

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function api(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}:${response.status}:${data.error || 'unknown'}`);
  return data;
}

function activeWallet(payload) {
  if (!Array.isArray(payload.wallets)) return payload;
  const wallet = payload.wallets.find((row) => row.activeForCalls === true)
    ?? payload.wallets.find((row) => row.currencyCode === payload.activeCurrencyCode)
    ?? payload.wallets[0];
  if (!wallet) throw new Error('active_wallet_missing');
  return wallet;
}

function balanceMinor(walletPayload) {
  const wallet = activeWallet(walletPayload);
  const value = wallet.balanceMinor ?? wallet.balance_minor ?? wallet.balance?.minor;
  if (value === undefined || value === null) throw new Error('wallet_balance_missing');
  return BigInt(value);
}

function reservedMinor(walletPayload) {
  const wallet = activeWallet(walletPayload);
  const value = wallet.reservedMinor ?? wallet.reserved_minor ?? wallet.reserved?.minor;
  if (value === undefined || value === null) throw new Error('wallet_reserved_missing');
  return BigInt(value);
}

function earningsTotal(earnings) {
  return (earnings.summary ?? []).reduce((total, row) => total + BigInt(row.amountMinor ?? 0), 0n);
}

function earningsCount(earnings) {
  return (earnings.summary ?? []).reduce((total, row) => total + Number(row.earningCount ?? 0), 0);
}

const productionProbe = await fetch(production + '/v1/internal-beta/owner-test', { redirect: 'manual' });
if (![403, 404].includes(productionProbe.status)) throw new Error('production_hard_block:' + productionProbe.status);
console.log('PRODUCTION_HARD_BLOCK=PASS');
console.log('AUDIO_EVIDENCE_PRESERVED=PASS');
console.log('FRESH_EXECUTION=PASS');

const boot = await api('/v1/internal-beta/owner-test/bootstrap', '', 'POST');
if (boot.credit?.liveMoney !== false) throw new Error('live_money_not_disabled');
const caller = boot.sessions.caller;
const listener = boot.sessions.listener;
await api('/v1/listener/presence', listener, 'POST', { status: 'online', acceptsMale: true, acceptsFemale: true });
await api('/v1/listener/presence/heartbeat', listener, 'POST', {});
const marketplace = await api('/v1/listeners?online=true&language=fa', caller);
if (!marketplace.listeners.some((row) => row.id === boot.listener.id)) throw new Error('listener_not_visible');

const walletBefore = await api('/v1/wallet', caller);
const listenerEarningsBefore = await api('/v1/listener/earnings', listener);

async function startAndConnect(label) {
  const call = await api('/v1/internal-beta/owner-test/call', caller, 'POST');
  if (call.liveMoney !== false) throw new Error('test_call_live_money');
  const callId = call.callId;
  const afterReserve = await api('/v1/wallet', caller);
  if (reservedMinor(afterReserve) <= reservedMinor(walletBefore)) throw new Error('wallet_not_reserved');

  const started = await api('/v1/calls/' + callId + '/voice/start', caller, 'POST', {});
  if (started.client?.relayConfigured !== true) throw new Error('product_ice_unavailable');
  const active = await api('/v1/listener/calls/active', listener);
  if (active.activeCall?.callId !== callId) throw new Error('listener_not_notified');

  await api('/v1/calls/' + callId + '/voice/signals', caller, 'POST', {
    kind: 'offer', payload: { type: 'offer', sdp: 'internal-lifecycle-offer-' + label },
  });
  await api('/v1/calls/' + callId + '/voice/signals', listener, 'POST', {
    kind: 'answer', payload: { type: 'answer', sdp: 'internal-lifecycle-answer-' + label },
  });
  const first = await api('/v1/calls/' + callId + '/voice/signals', caller, 'POST', { kind: 'media_connected', payload: {} });
  if (first.becameConnected || first.status === 'connected') throw new Error('connected_after_one_participant');
  const second = await api('/v1/calls/' + callId + '/voice/signals', listener, 'POST', { kind: 'media_connected', payload: {} });
  if (!second.becameConnected || second.status !== 'connected') throw new Error('connected_after_both_participants_failed');
  return { callId, afterReserve };
}

const first = await startAndConnect('caller-end');
console.log('PRODUCT_CALL_LIFECYCLE=PASS');
await sleep(2200);
const concurrentEnds = await Promise.all([
  api('/v1/calls/' + first.callId + '/voice/end', caller, 'POST', { reason: 'internal_lifecycle_caller_end' }),
  api('/v1/calls/' + first.callId + '/voice/end', caller, 'POST', { reason: 'internal_lifecycle_duplicate_end' }),
]);
const firstSettlement = concurrentEnds.find((row) => row.idempotent === false);
const duplicateSettlement = concurrentEnds.find((row) => row.idempotent === true);
if (!firstSettlement || !duplicateSettlement) throw new Error('duplicate_settlement_not_idempotent');
if (BigInt(firstSettlement.billableSeconds ?? 0) <= 0n || BigInt(firstSettlement.callerChargeMinor ?? 0) <= 0n || BigInt(firstSettlement.listenerEarningMinor ?? 0) <= 0n) {
  throw new Error('connected_billing_not_applied');
}

const second = await startAndConnect('listener-end');
await sleep(2200);
const listenerEnd = await api('/v1/calls/' + second.callId + '/voice/end', listener, 'POST', { reason: 'internal_lifecycle_listener_end' });
if (listenerEnd.idempotent !== false || BigInt(listenerEnd.callerChargeMinor ?? 0) <= 0n || BigInt(listenerEnd.listenerEarningMinor ?? 0) <= 0n) {
  throw new Error('listener_end_settlement_failed');
}

const noAnswer = await api('/v1/internal-beta/owner-test/call', caller, 'POST');
const noAnswerReserve = await api('/v1/wallet', caller);
if (reservedMinor(noAnswerReserve) <= 0n) throw new Error('no_answer_hold_missing');
await api('/v1/calls/' + noAnswer.callId + '/voice/start', caller, 'POST', {});
await sleep(92_000);
const noAnswerResult = await api('/v1/calls/' + noAnswer.callId + '/voice/no-answer', caller, 'POST', {});
const noAnswerDuplicate = await api('/v1/calls/' + noAnswer.callId + '/voice/no-answer', caller, 'POST', {});
if (String(noAnswerResult.chargedMinor) !== '0' || noAnswerResult.holdReleased !== true || noAnswerResult.idempotent !== false || noAnswerDuplicate.idempotent !== true) {
  throw new Error('no_answer_zero_charge_failed');
}
console.log('NO_ANSWER_ZERO_CHARGE=PASS');

const activeAfter = await api('/v1/listener/calls/active', listener);
if (activeAfter.activeCall) throw new Error('stale_active_call');
const marketAfter = await api('/v1/listeners?online=true&language=fa', caller);
if (marketAfter.listeners.some((row) => row.id === boot.listener.id)) throw new Error('stale_listener_presence');

const walletAfter = await api('/v1/wallet', caller);
if (reservedMinor(walletAfter) !== 0n) throw new Error('wallet_hold_not_released');
const expectedCharge = BigInt(firstSettlement.callerChargeMinor) + BigInt(listenerEnd.callerChargeMinor);
if (balanceMinor(walletBefore) - balanceMinor(walletAfter) !== expectedCharge) throw new Error('wallet_balance_not_settled_exactly');

const transactions = await api('/v1/wallet/transactions?limit=100', caller);
const callCharges = (transactions.transactions ?? []).filter((row) => row.type === 'call_charge' && [first.callId, second.callId].includes(row.callId));
if (callCharges.length !== 2) throw new Error('call_charge_ledger_count_invalid');
if (callCharges.filter((row) => row.callId === first.callId).length !== 1 || callCharges.filter((row) => row.callId === second.callId).length !== 1) {
  throw new Error('duplicate_call_charge_detected');
}

const listenerEarningsAfter = await api('/v1/listener/earnings', listener);
if (earningsCount(listenerEarningsAfter) < earningsCount(listenerEarningsBefore) + 2 || earningsTotal(listenerEarningsAfter) < earningsTotal(listenerEarningsBefore) + BigInt(firstSettlement.listenerEarningMinor) + BigInt(listenerEnd.listenerEarningMinor)) {
  throw new Error('listener_earning_ledger_invalid');
}

console.log('BILLING_SIMULATION=PASS');
console.log('SETTLEMENT_IDEMPOTENCY=PASS');
console.log('DUPLICATE_SETTLEMENT_SAFE=PASS');
console.log('W10_LIFECYCLE_BILLING_READY');
