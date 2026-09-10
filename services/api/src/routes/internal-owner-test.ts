import type { IncomingMessage, ServerResponse } from 'node:http';
import { withTransaction } from '../../../../packages/db/src/client.ts';
import { requireAuth } from '../lib/auth.ts';
import {
  INTERNAL_OWNER_TEST_CALLER_ID,
  INTERNAL_OWNER_TEST_LISTENER_ID,
  requireInternalOwnerTestMode,
} from '../lib/internal-owner-test.ts';
import { getDefaultOperatingContextCodes } from '../lib/operating-context.ts';
import { newOpaqueToken, tokenHash } from '../lib/security.ts';
import { HttpError, sendJson } from '../lib/http.ts';

const TEST_CREDIT_MINOR = 1_000_000_000n;

function sendHtml(res: ServerResponse, html: string): void {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.end(html);
}

export function serveOwnerTestPage(_req: IncomingMessage, res: ServerResponse): void {
  requireInternalOwnerTestMode();
  sendHtml(res, `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>تست داخلی مالک · یکی هست</title><style>
body{margin:0;background:#101914;color:#eef7f0;font-family:Tahoma,Arial,sans-serif}.wrap{max-width:760px;margin:48px auto;padding:24px}.card{background:#17251d;border:1px solid #31513d;border-radius:20px;padding:24px}.tag{color:#9fd8ae;font-size:13px}.note{color:#bbcabf;line-height:1.9}button{border:0;border-radius:12px;padding:14px 20px;background:#9fd8ae;color:#102016;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:wait}ol{line-height:2.1;padding-right:22px}.pass{color:#9fd8ae}.fail{color:#ff9c9c}code{direction:ltr;display:inline-block}</style></head>
<body><main class="wrap"><section class="card"><p class="tag">INTERNAL TEST DATA · PREVIEW ONLY</p><h1>تست داخلی Caller ↔ Listener</h1>
<p class="note">این مسیر از OTP، KYC و آموزش کاربران واقعی استفاده نمی‌کند. در Production وجود ندارد.</p>
<button id="run">ساخت شنونده تست و اجرای تماس داخلی</button><ol id="steps"></ol></section></main>
<script>
const button=document.getElementById('run'),steps=document.getElementById('steps');
function line(text,ok=true){const li=document.createElement('li');li.textContent=text;li.className=ok?'pass':'fail';steps.appendChild(li)}
async function request(path,token,method='GET',body){const r=await fetch(path,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||('HTTP '+r.status));return data}
button.onclick=async()=>{button.disabled=true;steps.textContent='';try{
 const boot=await request('/v1/internal-beta/owner-test/bootstrap','', 'POST');line('هویت‌های مصنوعی Caller و Listener ساخته یا بازیابی شدند');
 const listener=boot.sessions.listener,caller=boot.sessions.caller;
 await request('/v1/listener/presence',listener,'POST',{status:'online',acceptsMale:true,acceptsFemale:true});line('Listener روی Available Now قرار گرفت');
 await request('/v1/listener/presence/heartbeat',listener,'POST',{});line('Presence heartbeat ثبت شد');
 const market=await request('/v1/listeners?online=true&language=fa',caller);if(!market.listeners.some(x=>x.id===boot.listener.id))throw new Error('internal_listener_not_visible');line('Listener در marketplace داخلی دیده شد');
 const quote=await request('/v1/caller/quote?maxSeconds=600&target=instant',caller);if(!quote.wallet.enough)throw new Error('internal_test_credit_missing');line('اعتبار تست بدون پول واقعی آماده است');
 const call=await request('/v1/calls/request',caller,'POST',{clientRequestId:'owner-test-'+Date.now(),listenerId:boot.listener.id,listenerGender:'any',languageCode:'fa',mood:'just_talk',topicCode:'internal_owner_test',maxSeconds:600});line('Caller درخواست تماس را ارسال کرد');
 await request('/v1/calls/'+call.callId+'/voice/start',caller,'POST',{});
 await request('/v1/calls/'+call.callId+'/voice/signals',caller,'POST',{kind:'offer',payload:{type:'offer',sdp:'internal-owner-test-offer'}});line('درخواست و offer به Listener رسید');
 const active=await request('/v1/listener/calls/active',listener);if(active.activeCall?.callId!==call.callId)throw new Error('listener_did_not_receive_call');line('Listener تماس فعال را دریافت کرد');
 await request('/v1/calls/'+call.callId+'/voice/signals',listener,'POST',{kind:'answer',payload:{type:'answer',sdp:'internal-owner-test-answer'}});
 const signals=await request('/v1/calls/'+call.callId+'/voice/signals',caller);if(!signals.signals.some(x=>x.kind==='answer'&&x.senderRole==='listener'))throw new Error('answer_not_received');line('Listener پذیرفت؛ signaling به مرحله اتصال صدا رسید');
 sessionStorage.setItem('owner-test-listener-token',listener);sessionStorage.setItem('owner-test-caller-token',caller);sessionStorage.setItem('owner-test-call-id',call.callId);
 line('آماده تحویل به W10 برای WebRTC واقعی');
}catch(e){line('توقف: '+(e&&e.message?e.message:'unknown_error'),false)}finally{button.disabled=false}};
</script></body></html>`);
}

export async function bootstrapOwnerTest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  requireInternalOwnerTestMode();
  const callerToken = newOpaqueToken();
  const listenerToken = newOpaqueToken();
  const { productCode, serviceCode, marketCode } = getDefaultOperatingContextCodes();

  const result = await withTransaction(async (client) => {
    const context = await client.query<{
      product_id: string; service_id: string; market_id: string; language_id: string; currency_code: string;
    }>(`
      SELECT p.id::text product_id, s.id::text service_id, m.id::text market_id,
             l.id::text language_id, pp.currency_code
      FROM app.products p
      JOIN app.service_catalog s ON s.code=$2 AND s.status='active'
      JOIN app.markets m ON m.code=$3 AND m.is_active=true
      JOIN app.languages l ON l.code='fa' AND l.is_active=true
      JOIN app.pricing_plans pp ON pp.product_id=p.id AND pp.service_id=s.id AND pp.market_id=m.id
        AND pp.effective_from<=now() AND (pp.effective_to IS NULL OR pp.effective_to>now())
      WHERE p.code=$1
      ORDER BY pp.effective_from DESC LIMIT 1
    `, [productCode, serviceCode, marketCode]);
    const ctx = context.rows[0];
    if (!ctx) throw new HttpError(503, 'internal_test_context_unavailable');

    await client.query(`INSERT INTO app.users(id,status) VALUES ($1,'active'),($2,'active')
      ON CONFLICT (id) DO UPDATE SET status='active', archived_at=NULL`, [INTERNAL_OWNER_TEST_LISTENER_ID, INTERNAL_OWNER_TEST_CALLER_ID]);
    await client.query(`INSERT INTO app.user_roles(user_id,role) VALUES ($1,'listener'),($2,'caller') ON CONFLICT DO NOTHING`, [INTERNAL_OWNER_TEST_LISTENER_ID, INTERNAL_OWNER_TEST_CALLER_ID]);
    await client.query(`INSERT INTO app.caller_profiles(user_id,declared_gender,preferred_language_id,market_id)
      VALUES ($1,'female',$2,$3) ON CONFLICT (user_id) DO UPDATE SET preferred_language_id=EXCLUDED.preferred_language_id,market_id=EXCLUDED.market_id`, [INTERNAL_OWNER_TEST_CALLER_ID, ctx.language_id, ctx.market_id]);
    await client.query(`INSERT INTO app.caller_age_assertions(user_id,minimum_age,policy_version,assertion_method)
      VALUES ($1,18,'internal-owner-test-v1','internal_test') ON CONFLICT (user_id) DO UPDATE SET minimum_age=18,policy_version='internal-owner-test-v1',assertion_method='internal_test',asserted_at=now(),revoked_at=NULL`, [INTERNAL_OWNER_TEST_CALLER_ID]);

    await client.query(`INSERT INTO app.listener_applications(user_id,service_id,status,nickname,declared_gender,short_intro,listening_style)
      VALUES ($1,$2,'exploring','شنونده تست مالک','female','[INTERNAL TEST DATA] شنونده مصنوعی Preview','internal_owner_test')
      ON CONFLICT (user_id,service_id) DO UPDATE SET status='exploring',nickname=EXCLUDED.nickname,short_intro=EXCLUDED.short_intro,listening_style=EXCLUDED.listening_style,submitted_at=NULL,approved_at=NULL`, [INTERNAL_OWNER_TEST_LISTENER_ID, ctx.service_id]);
    await client.query(`INSERT INTO app.listener_profiles(user_id,nickname,gender,is_verified,reliability_score)
      VALUES ($1,'شنونده تست مالک','female',false,100) ON CONFLICT (user_id) DO UPDATE SET nickname=EXCLUDED.nickname,is_verified=false,reliability_score=100`, [INTERNAL_OWNER_TEST_LISTENER_ID]);
    await client.query(`INSERT INTO app.listener_service_profiles(listener_user_id,service_id,short_intro,style_text,is_public)
      VALUES ($1,$2,'[INTERNAL TEST DATA] شنونده مصنوعی Preview','internal_owner_test',false)
      ON CONFLICT (listener_user_id,service_id) DO UPDATE SET short_intro=EXCLUDED.short_intro,style_text=EXCLUDED.style_text,is_public=false`, [INTERNAL_OWNER_TEST_LISTENER_ID, ctx.service_id]);
    await client.query(`INSERT INTO app.listener_languages(listener_user_id,language_id,proficiency)
      VALUES ($1,$2,'native') ON CONFLICT (listener_user_id,language_id) DO UPDATE SET proficiency='native'`, [INTERNAL_OWNER_TEST_LISTENER_ID, ctx.language_id]);

    const wallet = await client.query<{id:string;balance_minor:string}>(`INSERT INTO app.wallets(user_id,currency_code)
      VALUES ($1,$2) ON CONFLICT (user_id,currency_code) DO UPDATE SET updated_at=now()
      RETURNING id::text,balance_minor::text`, [INTERNAL_OWNER_TEST_CALLER_ID, ctx.currency_code]);
    const current = BigInt(wallet.rows[0].balance_minor);
    const staleCalls = await client.query<{id:string}>(`UPDATE app.call_sessions SET status='cancelled',ended_at=COALESCE(ended_at,now()),ended_reason='internal_owner_test_reset',updated_at=now()
      WHERE caller_user_id=$1 AND status::text=ANY($2::text[]) RETURNING id::text`, [INTERNAL_OWNER_TEST_CALLER_ID,['requested','routing','calling_caller','caller_answered','calling_listener','connected']]);
    for (const call of staleCalls.rows) {
      await client.query(`INSERT INTO app.call_events(call_session_id,status,source,metadata) VALUES ($1,'cancelled','system',$2::jsonb)`, [call.id,JSON.stringify({internalTestData:true,reason:'owner_test_reset'})]);
      await client.query(`DELETE FROM app.internet_voice_signals WHERE call_session_id=$1`, [call.id]);
    }
    await client.query(`UPDATE app.wallets SET reserved_minor=0,version=version+1 WHERE id=$1 AND reserved_minor<>0`, [wallet.rows[0].id]);
    if (current < TEST_CREDIT_MINOR) {
      const delta = TEST_CREDIT_MINOR-current;
      await client.query(`UPDATE app.wallets SET balance_minor=balance_minor+$2,version=version+1 WHERE id=$1`, [wallet.rows[0].id, delta.toString()]);
      await client.query(`INSERT INTO app.wallet_transactions(wallet_id,currency_code,type,delta_minor,balance_after_minor,created_by_user_id,reason_code,idempotency_key)
        VALUES ($1,$2,'manual_credit',$3,$4,$5,'internal_owner_test','internal-owner-test-credit:'||gen_random_uuid()::text)`, [wallet.rows[0].id, ctx.currency_code, delta.toString(), TEST_CREDIT_MINOR.toString(), INTERNAL_OWNER_TEST_CALLER_ID]);
      await client.query(`INSERT INTO app.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
        VALUES ($1,'internal_owner_test_credit','wallet',$2,$3::jsonb)`, [INTERNAL_OWNER_TEST_CALLER_ID,wallet.rows[0].id,JSON.stringify({internalTestData:true,deltaMinor:delta.toString(),currencyCode:ctx.currency_code})]);
    }

    await client.query(`UPDATE private_data.auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id IN ($1,$2) AND revoked_at IS NULL`, [INTERNAL_OWNER_TEST_LISTENER_ID, INTERNAL_OWNER_TEST_CALLER_ID]);
    await client.query(`INSERT INTO private_data.auth_sessions(user_id,token_hash,expires_at) VALUES ($1,$3,now()+interval '8 hours'),($2,$4,now()+interval '8 hours')`, [INTERNAL_OWNER_TEST_LISTENER_ID, INTERNAL_OWNER_TEST_CALLER_ID, tokenHash(listenerToken), tokenHash(callerToken)]);
    await client.query(`INSERT INTO app.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
      VALUES ($1,'internal_owner_test_bootstrap','internal_test_session',$2,$3::jsonb)`, [INTERNAL_OWNER_TEST_CALLER_ID,INTERNAL_OWNER_TEST_LISTENER_ID,JSON.stringify({internalTestData:true,vercelEnv:process.env.VERCEL_ENV??null})]);
    return { currencyCode: ctx.currency_code };
  });

  sendJson(res, 200, {
    ok: true,
    internalTestData: true,
    listener: { id: INTERNAL_OWNER_TEST_LISTENER_ID, nickname: 'شنونده تست مالک' },
    caller: { id: INTERNAL_OWNER_TEST_CALLER_ID },
    sessions: { listener: listenerToken, caller: callerToken },
    credit: { liveMoney: false, currencyCode: result.currencyCode },
  });
}

export async function assertOwnerTestActor(req: IncomingMessage, expected: 'caller'|'listener'): Promise<string> {
  requireInternalOwnerTestMode();
  const { userId } = await requireAuth(req);
  const expectedId = expected === 'caller' ? INTERNAL_OWNER_TEST_CALLER_ID : INTERNAL_OWNER_TEST_LISTENER_ID;
  if (userId !== expectedId) throw new HttpError(403, 'internal_test_actor_required');
  return userId;
}
