import { chromium } from 'playwright';

const base=process.env.PREVIEW_URL;
const production='https://yeki-hast-unique-6ff0.vercel.app';
async function api(path,token,method='GET',body){
 const r=await fetch(base+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(path+':'+r.status+':'+(data.error||'unknown'));
 return data;
}
function walletAmount(w){return String(w.balanceMinor??w.balance_minor??w.balance?.minor??w.availableMinor??'unknown')}
const prod=await fetch(production+'/v1/internal-beta/owner-test',{redirect:'manual'});
if(![403,404].includes(prod.status))throw new Error('production_hard_block:'+prod.status);
console.log('PRODUCTION_HARD_BLOCK=PASS');
const boot=await api('/v1/internal-beta/owner-test/bootstrap','', 'POST');
if(boot.credit?.liveMoney!==false)throw new Error('live_money_not_disabled');
const caller=boot.sessions.caller,listener=boot.sessions.listener;
await api('/v1/listener/presence',listener,'POST',{status:'online',acceptsMale:true,acceptsFemale:true});
await api('/v1/listener/presence/heartbeat',listener,'POST',{});
const market=await api('/v1/listeners?online=true&language=fa',caller);
if(!market.listeners.some(x=>x.id===boot.listener.id))throw new Error('listener_not_visible');
const walletBefore=await api('/v1/wallet',caller);
const call=await api('/v1/internal-beta/owner-test/call',caller,'POST');
if(call.liveMoney!==false)throw new Error('call_live_money');
const callId=call.callId;
const started=await api('/v1/calls/'+callId+'/voice/start',caller,'POST',{});
if(started.client?.relayConfigured!==true||!started.client.iceServers?.some(s=>[s.urls].flat().some(u=>/^turns?:/i.test(u))))throw new Error('product_ice_config');
const active=await api('/v1/listener/calls/active',listener);
if(active.activeCall?.callId!==callId)throw new Error('listener_receive');
const listenerConfig=await api('/v1/calls/'+callId+'/voice/config',listener);
if(listenerConfig.client?.relayConfigured!==true)throw new Error('listener_ice_config');
console.log('PRODUCT_FLOW=PASS');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.goto(base+'/__w10_browser_origin__',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async ({base,callId,caller,listener,callerIce,listenerIce})=>{
  async function api(path,token,method='GET',body){
   const r=await fetch(base+path,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
   const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+':'+r.status+':'+(data.error||'unknown'));return data;
  }
  const a=new RTCPeerConnection({iceServers:callerIce,iceTransportPolicy:'relay'});
  const b=new RTCPeerConnection({iceServers:listenerIce,iceTransportPolicy:'relay'});
  const acA=new AudioContext(),acB=new AudioContext();
  const dstA=acA.createMediaStreamDestination(),dstB=acB.createMediaStreamDestination();
  const oscA=acA.createOscillator(),oscB=acB.createOscillator();
  oscA.frequency.value=440;oscB.frequency.value=660;oscA.connect(dstA);oscB.connect(dstB);oscA.start();oscB.start();
  a.addTrack(dstA.stream.getAudioTracks()[0],dstA.stream);
  b.addTrack(dstB.stream.getAudioTracks()[0],dstB.stream);
  let trackA=false,trackB=false;
  a.ontrack=e=>{if(e.track.kind==='audio')trackA=true};
  b.ontrack=e=>{if(e.track.kind==='audio')trackB=true};
  const sentA=[],sentB=[];let chainA=Promise.resolve(),chainB=Promise.resolve();
  a.onicecandidate=e=>{if(e.candidate){const p=e.candidate.toJSON();sentA.push(p);chainA=chainA.then(()=>api('/v1/calls/'+callId+'/voice/signals',caller,'POST',{kind:'ice',payload:p}))}};
  b.onicecandidate=e=>{if(e.candidate){const p=e.candidate.toJSON();sentB.push(p);chainB=chainB.then(()=>api('/v1/calls/'+callId+'/voice/signals',listener,'POST',{kind:'ice',payload:p}))}};
  const wait=async(fn,ms=70000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw new Error('timeout');await new Promise(r=>setTimeout(r,100))}};
  try{
   await a.setLocalDescription(await a.createOffer());
   await api('/v1/calls/'+callId+'/voice/signals',caller,'POST',{kind:'offer',payload:{type:a.localDescription.type,sdp:a.localDescription.sdp}});
   const offerSignals=await api('/v1/calls/'+callId+'/voice/signals',listener);
   const offer=offerSignals.signals.find(x=>x.kind==='offer'&&x.senderRole==='caller');if(!offer)throw new Error('offer_missing');
   await b.setRemoteDescription(offer.payload);
   await b.setLocalDescription(await b.createAnswer());
   await api('/v1/calls/'+callId+'/voice/signals',listener,'POST',{kind:'answer',payload:{type:b.localDescription.type,sdp:b.localDescription.sdp}});
   const answerSignals=await api('/v1/calls/'+callId+'/voice/signals',caller);
   const answer=answerSignals.signals.find(x=>x.kind==='answer'&&x.senderRole==='listener');if(!answer)throw new Error('answer_missing');
   await a.setRemoteDescription(answer.payload);
   await wait(()=>a.iceGatheringState==='complete'&&b.iceGatheringState==='complete');await chainA;await chainB;
   const allA=await api('/v1/calls/'+callId+'/voice/signals',caller);
   const allB=await api('/v1/calls/'+callId+'/voice/signals',listener);
   const remoteForA=allA.signals.filter(x=>x.kind==='ice'&&x.senderRole==='listener');
   const remoteForB=allB.signals.filter(x=>x.kind==='ice'&&x.senderRole==='caller');
   if(!remoteForA.length||!remoteForB.length)throw new Error('ice_signaling_missing');
   for(const x of remoteForA)try{await a.addIceCandidate(x.payload)}catch{}
   for(const x of remoteForB)try{await b.addIceCandidate(x.payload)}catch{}
   await wait(()=>a.connectionState==='connected'&&b.connectionState==='connected'&&trackA&&trackB);
   async function stats(pc){
    const s=await pc.getStats();const vals=[...s.values()];
    const tr=vals.find(x=>x.type==='transport'&&x.selectedCandidatePairId);
    const pair=tr&&s.get(tr.selectedCandidatePairId);
    const lc=pair&&s.get(pair.localCandidateId),rc=pair&&s.get(pair.remoteCandidateId);
    const out=vals.filter(x=>x.type==='outbound-rtp'&&x.kind==='audio').reduce((q,x)=>({packets:q.packets+(x.packetsSent||0),bytes:q.bytes+(x.bytesSent||0)}),{packets:0,bytes:0});
    const inn=vals.filter(x=>x.type==='inbound-rtp'&&x.kind==='audio').reduce((q,x)=>({packets:q.packets+(x.packetsReceived||0),bytes:q.bytes+(x.bytesReceived||0)}),{packets:0,bytes:0});
    return {relay:pair?.state==='succeeded'&&lc?.candidateType==='relay'&&rc?.candidateType==='relay',out,inn};
   }
   let sa,sb;await wait(async()=>{sa=await stats(a);sb=await stats(b);return sa.relay&&sb.relay&&sa.out.packets>0&&sa.out.bytes>0&&sa.inn.packets>0&&sa.inn.bytes>0&&sb.out.packets>0&&sb.out.bytes>0&&sb.inn.packets>0&&sb.inn.bytes>0},30000);
   return {relay:sa.relay&&sb.relay,aToB:sa.out.bytes>0&&sb.inn.bytes>0,bToA:sb.out.bytes>0&&sa.inn.bytes>0,iceViaApi:remoteForA.length>0&&remoteForB.length>0};
  }finally{oscA.stop();oscB.stop();a.close();b.close();await acA.close();await acB.close();}
 },{base,callId,caller,listener,callerIce:started.client.iceServers,listenerIce:listenerConfig.client.iceServers});
 if(!result.relay||!result.aToB||!result.bToA||!result.iceViaApi)throw new Error('rtp_validation');
 console.log('REAL_PEER_CONNECTION=PASS');console.log('SELECTED_ICE=RELAY');console.log('CALLER_TO_LISTENER_AUDIO_RTP=PASS');console.log('LISTENER_TO_CALLER_AUDIO_RTP=PASS');
}finally{await browser.close()}
const beforeConnected=await api('/v1/calls/'+callId,caller);
if(beforeConnected.status==='connected')throw new Error('connected_before_media');
const firstMedia=await api('/v1/calls/'+callId+'/voice/signals',caller,'POST',{kind:'media_connected',payload:{}});
if(firstMedia.becameConnected||firstMedia.status==='connected')throw new Error('connected_after_one_side');
const secondMedia=await api('/v1/calls/'+callId+'/voice/signals',listener,'POST',{kind:'media_connected',payload:{}});
if(!secondMedia.becameConnected||secondMedia.status!=='connected')throw new Error('not_connected_after_both');
const end1=await api('/v1/calls/'+callId+'/voice/end',caller,'POST',{endedReason:'internal_audio_e2e'});
const end2=await api('/v1/calls/'+callId+'/voice/end',caller,'POST',{endedReason:'internal_audio_e2e'});
if(String(end1.callerChargeMinor)!=='0'||String(end1.listenerEarningMinor)!=='0'||end1.idempotent!==false||end2.idempotent!==true)throw new Error('settlement_or_billing');
const walletAfter=await api('/v1/wallet',caller);
if(walletAmount(walletBefore)!==walletAmount(walletAfter))throw new Error('wallet_changed');
console.log('PRODUCT_CALL_LIFECYCLE=PASS');console.log('BILLING_SIMULATION=PASS');console.log('SETTLEMENT_IDEMPOTENCY=PASS');console.log('W10_PRODUCT_AUDIO_E2E_AUTOMATED_READY');
