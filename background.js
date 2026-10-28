'use strict';
importScripts('mission.js');

// All message-driven mutations to an individual conversation go through this queue.
// A journaled SEND_CLAIM is never replayed following an ambiguous failure.
const VERSION = '0.7.2';
const DEFAULTS = Object.freeze({message:'go', settleSeconds:6, stallSeconds:180, maxTurns:2, limitMode:'limited', watchdogSeconds:30, autoReload:false});
const ALARM = 'auto-continue-watchdog';
const LOCKS = new Map();
const keyFor = id => `chat:${id}`;
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{10,}$/.test(id);
const tabMatches = (url,id) => {try {const u=new URL(url); return u.origin==='https://chatgpt.com' && new RegExp(`^(?:/g/[^/]+)?/c/${id}/?$`).test(u.pathname);}catch{return false;}};
function clamp(v,min,max,fallback){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;}
function normalize(r={}){return {schemaVersion:2,limitMode:r.limitMode==='unlimited'?'unlimited':'limited',message:String(r.message??'go').trim().slice(0,2000)||'go',settleSeconds:clamp(r.settleSeconds,3,60,6),stallSeconds:clamp(r.stallSeconds,60,3600,180),maxTurns:clamp(r.maxTurns,1,Number.MAX_SAFE_INTEGER,2),watchdogSeconds:clamp(r.watchdogSeconds,30,300,30),autoReload:r.autoReload===true};}
async function config(){const obj=await chrome.storage.local.get('settings');return normalize(obj.settings);}
async function alarm(){const s=await config();await chrome.alarms.create(ALARM,{periodInMinutes:Math.max(.5,s.watchdogSeconds/60)});}
function serial(id, work){
  const prev=LOCKS.get(id)||Promise.resolve();
  const next=prev.catch(()=>{}).then(work);
  LOCKS.set(id,next);next.finally(()=>{if(LOCKS.get(id)===next) LOCKS.delete(id);}).catch(()=>{});
  return next;
}
async function read(id){return (await chrome.storage.local.get(keyFor(id)))[keyFor(id)]||null;}
const diagnosticKey=id=>'diagnostics:'+id;
async function diagnostic(id,event,detail='',state=''){
  if(!validId(id))return;
  try{
    const existing=(await chrome.storage.local.get(diagnosticKey(id)))[diagnosticKey(id)]||[];
    const safeEvent=String(event).replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,48);
    // Strict allowlist: never persist message text, tokens, URLs, prompts, or credentials.
    const safeDetail=String(detail).replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,56);
    const item={time:Date.now(),event:safeEvent,detail:safeDetail,state:String(state).slice(0,30)};
    if(existing.at(-1)?.event===item.event&&existing.at(-1)?.detail===item.detail&&existing.at(-1)?.state===item.state)return;
    await chrome.storage.local.set({[diagnosticKey(id)]:[...existing.slice(-119),item]});
  }catch{}
}
async function write(id,session){
  const old=await read(id);
  await chrome.storage.local.set({[keyFor(id)]:{...session,updatedAt:Date.now()}});
  if(old?.state!==session.state||old?.enabled!==session.enabled)
    await diagnostic(id,'state_change',(old?.state||'NONE')+'_'+(session.enabled?'on':'off'),session.state||'UNKNOWN');
}
const fresh=(tabId,override)=>({enabled:true,ownerTabId:tabId,override,turns:0,state:'ARMING',generation:Date.now(),baseline:null,baselineStreaming:false,lastHandled:null,lastClaim:null,kickoffRequested:false,waitingSince:0,lastError:'',lastActivity:Date.now(),recoveryCount:0});
async function owner(id,sender){
  const s=await read(id);
  if(!s?.enabled || !Number.isInteger(sender.tab?.id) || s.ownerTabId!==sender.tab.id || !tabMatches(sender.tab.url,id)) return null;
  return s;
}
const noticesKey=id=>'notices:'+id;
async function noticeHistory(id){return (await chrome.storage.local.get(noticesKey(id)))[noticesKey(id)]||[];}
async function rememberNotice(id,item){
  const entries=await noticeHistory(id);
  if(entries[0]&&entries[0].generation===item.generation&&entries[0].state===item.state&&entries[0].reason===item.reason)return;
  await chrome.storage.local.set({[noticesKey(id)]:[item,...entries].slice(0,20)});
}
async function pause(id,reason,state='PAUSED'){
  const s=await read(id);if(!s)return;
  const nextState=['PAUSED','NEEDS_USER','COMPLETED','CANCELLED','ERROR'].includes(state)?state:'PAUSED';
  const explanation=String(reason).slice(0,360);
  await write(id,{...s,enabled:false,state:nextState,lastError:explanation,reviewRequired:nextState==='NEEDS_USER'?/human approval required|ChatGPT requires your attention/i.test(explanation):nextState==='COMPLETED'||nextState==='CANCELLED'?false:Boolean(s.reviewRequired),reviewOverrideKey:null});
  if((nextState==='COMPLETED'||nextState==='CANCELLED'||nextState==='ERROR'||nextState==='NEEDS_USER'||/uncertain|disconnected|failed|unavailable|error|exhausted/i.test(explanation))
    &&(s.enabled||s.state!==nextState||s.lastError!==explanation)){
    const m=await MissionSignal.get(id);
    await rememberNotice(id,{mode:m.mode||'local',missionId:m.mode==='mission'?m.id||null:null,state:nextState,reason:explanation,turns:s.turns||0,generation:s.generation||null,recordedAt:Date.now()});
  }
}
async function sessionStatus(id){
  let s=await read(id);if(!s?.enabled)return s;
  let t;try{t=await chrome.tabs.get(s.ownerTabId);}catch{}
  if(!t||!tabMatches(t.url,id)){
    const expected=s;
    await serial(id,async()=>{const latest=await read(id);if(latest?.enabled&&latest.ownerTabId===expected.ownerTabId&&latest.generation===expected.generation)await pause(id,'Owner tab unavailable or navigated. Review before starting.');});
    s=await read(id);
  }
  return s;
}
async function dispatch(m,sender){
  if(m.type==='STATUS'){
    if(!validId(m.id))return {ok:true,callerTabId:sender.tab?.id,settings:await config(),session:null,mission:null,version:VERSION};
    // Serialize polling with cancel, mode switch and sends: a stale ACTIVE status
    // must never overwrite a terminal mission state.
    const remote=await serial(m.id,async()=>{
      const stalled=await read(m.id);
      if(stalled?.enabled&&stalled.state==='SENDING'&&Number.isFinite(stalled.updatedAt)&&Date.now()-stalled.updatedAt>45000){
        await diagnostic(m.id,'sending_timeout','acknowledgment_uncertain','SENDING');
        await pause(m.id,'Sending timed out. Submission is uncertain: review the transcript before resuming. No automatic retry.','NEEDS_USER');
      }
      const result=await MissionSignal.synchronize(m.id);
      if(result.mode==='mission'&&['COMPLETED','CANCELLED'].includes(result.state)){
        const current=await read(m.id);
        if(current&&current.state!==result.state)
          await pause(m.id,result.state==='COMPLETED'?'Remote mission completed.':'Mission cancelled.',result.state);
      }
      return result;
    });
    return {ok:true,callerTabId:sender.tab?.id,settings:await config(),session:await sessionStatus(m.id),mission:MissionSignal.summary(remote),missionHistory:await MissionSignal.getHistory(m.id),noticeHistory:await noticeHistory(m.id),version:VERSION};
  }
  if(m.type==='GET_DIAGNOSTICS'){
    if(!validId(m.id))return {ok:true,entries:[]};
    const raw=(await chrome.storage.local.get(diagnosticKey(m.id)))[diagnosticKey(m.id)]||[];
    const session=await read(m.id),mission=await MissionSignal.get(m.id);
    return {ok:true,version:VERSION,mode:mission.mode,sessionState:session?.state||'IDLE',enabled:!!session?.enabled,entries:raw};
  }
  if(m.type==='CLEAR_DIAGNOSTICS'){
    if(!validId(m.id))throw Error('Select a conversation.');
    await chrome.storage.local.remove(diagnosticKey(m.id));return {ok:true};
  }
  if(m.type==='TRACE'){
    if(!validId(m.id)||!sender.tab||!tabMatches(sender.tab.url,m.id))return {ok:false};
    await diagnostic(m.id,m.event,m.detail,m.state);return {ok:true};
  }
  if(m.type==='GET_MISSION_CONNECTION'){const c=await MissionSignal.connection();return {ok:true,endpoint:c.endpoint,configured:Boolean(c.enrollment)};}
  if(m.type==='SET_MISSION_CONNECTION'){
    const c=await MissionSignal.connection();
    const candidate=String(m.enrollment||'').trim()||c.enrollment;
    if(!candidate)throw Error('Enter an enrollment key.');
    await MissionSignal.verifyEnrollment(candidate);
    if(String(m.enrollment||'').trim())await MissionSignal.configure(candidate);
    return {ok:true,verified:true};
  }
  if(m.type==='CANCEL_MISSION'){
    if(!validId(m.id))throw Error('Open a saved conversation first.');
    const t=await chrome.tabs.get(Number(m.tabId));if(!tabMatches(t.url,m.id))throw Error('Conversation changed.');
    return serial(m.id,async()=>{
      const current=await read(m.id);
      if(current?.enabled&&current.ownerTabId!==t.id)throw Error('Only owner tab can cancel.');
      // Stop local sends before waiting for the network. Remote cancellation may fail;
      // the popup must then say so and allow the user to retry.
      if(current)await write(m.id,{...current,enabled:false,ownerTabId:null,state:'PAUSED',lastError:'Local automation stopped. Confirming remote cancellation…'});
      try{
        const remote=await MissionSignal.cancel(m.id);
        const latest=await read(m.id);
        if(latest)await write(m.id,{...latest,state:remote.state==='COMPLETED'?'COMPLETED':'CANCELLED',lastError:remote.state==='COMPLETED'?'Remote mission already completed.':'Mission cancelled on homeserver.'});
        return {ok:true,state:remote.state};
      }catch(error){
        const latest=await read(m.id);
        if(latest)await write(m.id,{...latest,enabled:false,state:'PAUSED',lastError:'Local automation stopped, but remote cancellation was not confirmed. Retry Cancel Mission when connected.'});
        throw error;
      }
    });
  }
  if(m.type==='RESUME_MISSION'){
    if(!validId(m.id))throw Error('Open a saved conversation first.');
    const t=await chrome.tabs.get(Number(m.tabId));if(!tabMatches(t.url,m.id))throw Error('Conversation changed.');
    return serial(m.id,async()=>{
      const sess=await read(m.id),mstate=await MissionSignal.synchronize(m.id,true);
      if(mstate.mode!=='mission'||mstate.state!=='ACTIVE'||mstate.instruction?.state!=='sent')throw Error('Mission instruction not verified. Review transcript or start a new mission.');
      if(sess?.enabled)throw Error('Pause before resuming.');
      if(sess?.limitMode==='limited'&&(sess.turns||0)>=(sess.maxTurns||1))throw Error('Continuation cap reached.');
      const defaults=await config();
      await write(m.id,{...fresh(t.id,sess?.override||''),missionId:mstate.id,limitMode:sess?.missionCapEnabled?'limited':'unlimited',missionCapEnabled:sess?.missionCapEnabled||false,localLimitMode:sess?.localLimitMode||defaults.limitMode,localMaxTurns:sess?.localMaxTurns||defaults.maxTurns,missionMaxTurns:sess?.missionMaxTurns||sess?.maxTurns||20,maxTurns:sess?.missionMaxTurns||sess?.maxTurns||20,turns:sess?.turns||0,lastClaim:sess?.lastClaim||null,lastHandled:sess?.lastHandled||null,generation:`${Date.now()}-${Math.random()}`});
      return {ok:true};
    });
  }
  if(m.type==='SET_MISSION_MODE'||m.type==='NEW_MISSION'){
    if(!validId(m.id))throw Error('Open a saved conversation first.');
    const t=await chrome.tabs.get(Number(m.tabId));if(!tabMatches(t.url,m.id))throw Error('Conversation changed.');
    return serial(m.id,async()=>{if((await read(m.id))?.enabled)throw Error('Pause before changing mission mode.');
      if(m.type==='NEW_MISSION'){
        const current=await MissionSignal.get(m.id);
        if(current.registered&&current.state==='ACTIVE')throw Error('Cancel the active remote mission before creating a new one.');
        // This invalidates the local controller's association; it does not claim
        // to cancel a registered mission on the remote service.
        await MissionSignal.put(m.id,{mode:'mission'});
        const previous=await read(m.id);
        if(previous)await write(m.id,{...previous,enabled:false,ownerTabId:null,state:'PAUSED',missionId:null,lastClaim:null,lastHandled:null,baseline:null,reviewRequired:false,reviewOverrideKey:null,kickoffRequested:false,lastError:'',waitingSince:0,documentId:null});
        return {ok:true,replaced:current.id||null};
      }
      else {
        const before=await MissionSignal.get(m.id);
        await MissionSignal.setMode(m.id,m.mode);
        if(before.mode!==m.mode){
          const previous=await read(m.id);
          // Mode changes clear ONLY obsolete human-review UI state. They never
          // clear an uncertain send journal or fabricate a completed mission.
          if(previous?.reviewRequired&&previous.state==='NEEDS_USER')
            await write(m.id,{...previous,state:'PAUSED',reviewRequired:false,reviewOverrideKey:null,lastError:''});
        }
      }
      return {ok:true};});
  }
  if(m.type==='RECONCILE_INSTRUCTION'){
    if(!validId(m.id)||!sender.tab||!tabMatches(sender.tab.url,m.id))return {ok:false};
    return serial(m.id,async()=>{
      const mission=await MissionSignal.get(m.id),session=await read(m.id);
      if(mission.mode!=='mission'||mission.instruction?.state!=='claimed'||!session?.lastClaim||
         session.lastClaim.kind!=='instruction'||session.lastClaim.token!==mission.instruction.token)return {ok:false};
      const expected=MissionSignal.instruction(mission.id);
      // Only the actual newest user message in this exact conversation is eligible.
      if(String(m.userText||'').trim()!==expected||!Number.isInteger(m.userCount)||
         m.userCount<=(session.baseline?.userCount||0))return {ok:false};
      if(!await MissionSignal.acknowledgeInstruction(m.id,session.lastClaim.token))return {ok:false};
      await write(m.id,{...session,enabled:false,state:'PAUSED',lastError:'Mission instruction found in transcript. Press Start to resume this mission.',lastHandled:session.lastClaim.assistantKey});
      return {ok:true,reconciled:true};
    });
  }
  if(m.type==='SET_SETTINGS'){
    const s=await config(),r=m.settings||{};
    const next={message:String(r.message??s.message).trim().slice(0,2000)||'go',settleSeconds:clamp(r.settleSeconds??s.settleSeconds,3,60,6),stallSeconds:clamp(r.stallSeconds??s.stallSeconds,60,3600,180),limitMode:r.limitMode??s.limitMode,maxTurns:clamp(r.maxTurns??s.maxTurns,1,Number.MAX_SAFE_INTEGER,2),watchdogSeconds:clamp(r.watchdogSeconds??s.watchdogSeconds,30,300,30),autoReload:Boolean(r.autoReload??s.autoReload)};
    await chrome.storage.local.set({settings:normalize(next)});await alarm();return {ok:true,settings:next};
  }
  if(m.type==='SET_LIMIT'){
    if(!validId(m.id))throw Error('Open a saved ChatGPT conversation first.');
    const t=await chrome.tabs.get(Number(m.tabId));if(!tabMatches(t.url,m.id))throw Error('Conversation changed.');
    if(!['limited','unlimited'].includes(m.limitMode))throw Error('Choose Limited or Unlimited.');
    const n=Number(m.maxTurns);if(!Number.isSafeInteger(n)||n<1)throw Error('Continuation limit must be a positive whole number.');
    return serial(m.id,async()=>{const old=await read(m.id);if(old?.enabled&&old.ownerTabId!==t.id)throw Error('Change limits in the owner tab.');
      const remoteMode=(await MissionSignal.get(m.id)).mode==='mission';
      const defaults=await config();
      const next={...(old||{enabled:false,state:'IDLE',turns:0}),
        limitMode:m.limitMode,maxTurns:n,
        localLimitMode:remoteMode?(old?.localLimitMode||defaults.limitMode):m.limitMode,
        localMaxTurns:remoteMode?(old?.localMaxTurns||old?.maxTurns||defaults.maxTurns):n,
        missionCapEnabled:remoteMode?m.limitMode==='limited':old?.missionCapEnabled||false,
        missionMaxTurns:remoteMode?n:old?.missionMaxTurns||20};
      await write(m.id,next);if(next.enabled&&next.limitMode==='limited'&&next.turns>=n)await pause(m.id,'Maximum auto-continue count reached.');return {ok:true};});
  }
  if(m.type==='SET_MISSION_CAP'){
    if(!validId(m.id))throw Error('Open a saved conversation.');
    const tab=await chrome.tabs.get(Number(m.tabId));if(!tabMatches(tab.url,m.id))throw Error('Conversation changed.');
    const n=Number(m.maxTurns);if(!Number.isSafeInteger(n)||n<1)throw Error('Enter a positive cap.');
    return serial(m.id,async()=>{
      const old=await read(m.id);if(old?.enabled)throw Error('Pause the mission before changing its safety cap.');
      if((await MissionSignal.get(m.id)).mode!=='mission')throw Error('Choose Mission Signal first.');
      await write(m.id,{...(old||{enabled:false,state:'IDLE',turns:0}),missionCapEnabled:m.enabled===true,missionMaxTurns:n,maxTurns:n,limitMode:m.enabled===true?'limited':'unlimited'});
      return {ok:true};
    });
  }
  if(m.type==='SET_SESSION'){
    const id=String(m.id||'');if(!validId(id)) throw Error('Open a saved ChatGPT conversation first.');
    const tabId=Number(m.tabId);if(!Number.isInteger(tabId)||tabId<0) throw Error('Missing conversation tab.');
    const t=await chrome.tabs.get(tabId);if(!tabMatches(t.url,id)) throw Error('Conversation has changed. Reopen the popup.');
    return serial(id,async()=>{
      const existing=await read(id),enabled=Boolean(m.enabled);
      if(enabled && existing?.enabled && existing.ownerTabId!==tabId){
        let ownerTab;try{ownerTab=await chrome.tabs.get(existing.ownerTabId);}catch{}
        if(!ownerTab||!tabMatches(ownerTab.url,id)){await pause(id,'Owner tab unavailable. Review the conversation before starting here.');throw Error('Owner unavailable; automation paused. Review the transcript before starting.');}
        throw Error('Already active in another tab. Pause it there first.');
      }
      const override=typeof m.override==='string'?m.override.trim().slice(0,2000):existing?.override||'';
      if(!enabled && existing?.enabled && existing.ownerTabId!==tabId) throw Error('Only the owner tab can pause this conversation.');
      if(!enabled){await write(id,{...(existing||fresh(tabId,override)),enabled:false,ownerTabId:null,override,state:'PAUSED',lastError:''});return {ok:true};}
      if(existing?.enabled){await write(id,{...existing,override});return {ok:true};}
      const mission=await MissionSignal.ensure(id);if(mission.mode==='mission'&&mission.state==='CANCELLED')throw Error('Mission cancelled. Prepare a new mission.');
      if(mission.mode==='mission'&&mission.state==='COMPLETED'){await pause(id,'Remote mission completed.','COMPLETED');return {ok:false,error:'Mission is completed. Start again to create a new mission.'};}
      if(mission.mode==='mission'&&mission.connection==='disconnected'&&(mission.offlineAttempts||0)>=5)throw Error('Five offline attempts exhausted. Reconnect before restarting.');
      const defaults=await config(),resumeMission=mission.mode==='mission'&&mission.id&&existing?.missionId===mission.id;
      const localMax=existing?.localMaxTurns||existing?.maxTurns||defaults.maxTurns;
      const missionMax=existing?.missionMaxTurns||existing?.maxTurns||20;
      const s={...fresh(tabId,override),missionId:mission.mode==='mission'?mission.id:null,limitMode:mission.mode==='mission'?(existing?.missionCapEnabled?'limited':'unlimited'):existing?.localLimitMode||existing?.limitMode||defaults.limitMode,missionCapEnabled:existing?.missionCapEnabled||false,localLimitMode:existing?.localLimitMode||existing?.limitMode||defaults.limitMode,localMaxTurns:localMax,missionMaxTurns:missionMax,maxTurns:mission.mode==='mission'?missionMax:localMax,generation:`${Date.now()}-${Math.random().toString(36).slice(2)}`,...(resumeMission?{turns:existing.turns||0,lastClaim:existing.lastClaim||null,lastHandled:existing.lastHandled||null,reviewRequired:Boolean(existing.reviewRequired)}:{reviewRequired:Boolean(existing?.reviewRequired),...(existing?.reviewRequired?{lastClaim:existing.lastClaim||null,lastHandled:existing.lastHandled||null,turns:existing.turns||0}:{})})};
      if(resumeMission&&s.limitMode!=='unlimited'&&s.turns>=s.maxTurns)throw Error('Mission continuation limit reached. Raise the limit or explicitly prepare a new mission.');
      await write(id,s);return {ok:true};
    });
  }
  if(m.type==='SAVE_MESSAGE'){
    if(!validId(m.id))throw Error('Open a saved conversation first.');
    const t=await chrome.tabs.get(Number(m.tabId));if(!tabMatches(t.url,m.id))throw Error('Conversation changed.');
    return serial(m.id,async()=>{const s=await read(m.id);if(s?.enabled&&s.ownerTabId!==t.id)throw Error('Message belongs to the owner tab.');await write(m.id,{...(s||{enabled:false,state:'IDLE',turns:0}),override:String(m.override||'').trim().slice(0,2000)});return {ok:true};});
  }
  if(m.type==='DISMISS_REVIEW'){
    if(!validId(m.id))throw Error('Open a saved conversation.');
    const tab=await chrome.tabs.get(Number(m.tabId));
    if(!tabMatches(tab.url,m.id))throw Error('Conversation changed.');
    return serial(m.id,async()=>{
      const current=await read(m.id);
      if(!current||current.enabled)throw Error('Pause automation before dismissing a warning.');
      if(!current.reviewRequired||current.state!=='NEEDS_USER')
        throw Error('There is no human-approval warning to dismiss.');
      await write(m.id,{...current,state:'PAUSED',reviewRequired:false,reviewOverrideKey:null,lastError:''});
      await diagnostic(m.id,'review_dismissed','user_chose_ignore','PAUSED');
      return {ok:true};
    });
  }
  if(m.type==='REQUEST_REVIEW_CONTINUE'){
    if(!validId(m.id))throw Error('Open a saved conversation.');
    const t=await chrome.tabs.get(Number(m.tabId));
    if(!tabMatches(t.url,m.id))throw Error('Conversation changed.');
    return serial(m.id,async()=>{
      const s=await read(m.id);
      if(!s?.enabled||s.ownerTabId!==t.id||!s.reviewRequired)throw Error('Start the paused session after reviewing the blocker.');
      if(!['OBSERVING','AWAITING_REPLY'].includes(s.state)||!s.baseline?.assistantKey||!s.lastClaim||s.lastClaim.kind!=='continuation')
        throw Error('A stable completed assistant reply and prior send record are required.');
      if(s.kickoffRequested||s.reviewOverrideKey)throw Error('Review continuation already requested.');
      const remote=await MissionSignal.get(m.id);
      if(remote.mode==='mission'&&(remote.state!=='ACTIVE'||remote.instruction?.state!=='sent'))
        throw Error('Mission must remain active with its setup instruction delivered.');
      await write(m.id,{...s,reviewOverrideKey:s.baseline.assistantKey});
      await diagnostic(m.id,'review_continuation_requested','explicit_confirmation',s.state);
      return {ok:true};
    });
  }
  if(m.type==='REQUEST_KICKOFF') {
    if(!validId(m.id))return {ok:false,error:'Invalid conversation ID.'};
    const tabId=Number(m.tabId);
    const tab=await chrome.tabs.get(tabId);
    if(!tabMatches(tab.url,m.id))return {ok:false,error:'Conversation tab changed.'};
    return serial(m.id,async()=>{
      const sess=await read(m.id);
      if(!sess?.enabled||sess.ownerTabId!==tabId)return {ok:false,error:'Not the active conversation.'};
      if(sess.state!=='OBSERVING'||!sess.baseline?.assistantKey||sess.lastClaim)return {ok:false,error:'Not idle and ready. Wait for the conversation to settle.'};
      await write(m.id,{...sess,kickoffRequested:true});return {ok:true};
    });
  }
  if(!validId(m.id)) return {ok:false,error:'Invalid conversation ID.'};
  return serial(m.id,async()=>{
    const s=await owner(m.id,sender);
    if(!s)return {ok:false,error:'Session inactive or not owned by this tab.'};
    if(m.generation&&m.generation!==s.generation)return {ok:false,reason:'stale activation'};
    if(m.type==='MISSION_SYNC'){
      const mission=await MissionSignal.synchronize(m.id,Boolean(m.force));if(mission.mode==='mission'&&mission.state==='COMPLETED')await pause(m.id,'Remote mission completed.','COMPLETED');
      if(mission.mode==='mission'&&mission.state==='CANCELLED')await pause(m.id,'Mission cancelled.');return {ok:true,mission:MissionSignal.summary(mission)};
    }
    if(m.type==='CHECK_SEND')return {ok:s.state==='SENDING'&&s.lastClaim?.token===m.token};
    if(m.type==='ATTACH'){
      if(s.documentId&&s.documentId!==m.documentId){await pause(m.id,'Page refreshed. Review the conversation and press Start to resume.');return {ok:false};}
      return {ok:true};
    }
    if(m.type==='BASELINE'){
      if(s.state!=='ARMING')return {ok:false,reason:'not arming'};
      const baseline=m.snapshot||{};
      await write(m.id,{...s,documentId:m.documentId||null,state:baseline.busy?'GENERATING':'OBSERVING',baseline:{assistantKey:baseline.assistantKey||null,assistantSig:baseline.assistantSig||null,userKey:baseline.userKey||null,userCount:baseline.userCount||0},baselineStreaming:Boolean(baseline.busy),lastHandled:baseline.busy?null:(baseline.assistantKey||null),lastActivity:Date.now()});
      return {ok:true};
    }
    if(m.type==='PROGRESS'){
      const allowed=['OBSERVING','GENERATING','SETTLING','READY','AWAITING_REPLY'];if(!allowed.includes(s.state))return {ok:false,reason:'invalid state'};
      const next=String(m.state||'');if(!allowed.includes(next))return {ok:false};
      await write(m.id,{...s,state:next,lastError:'',lastActivity:Date.now()});return {ok:true};
    }
    if(m.type==='CLAIM_SEND'){
      if(!['OBSERVING','GENERATING','SETTLING','READY','AWAITING_REPLY'].includes(s.state))return {ok:false,reason:'not ready'};
      const snapshot=m.snapshot||{};
      const instruction=Boolean(m.instruction);
      const emptyBootstrap=instruction&&snapshot.emptyChat===true&&s.baseline?.userCount===0&&!s.baseline?.assistantKey&&!s.lastClaim;
      if((!snapshot.assistantKey||!snapshot.assistantSig)&&!emptyBootstrap)return {ok:false,reason:'missing assistant'};
      const kick=Boolean(m.kickoff&&s.kickoffRequested&&!s.lastClaim&&s.baseline?.assistantKey===snapshot.assistantKey);
      const review=Boolean(s.reviewRequired&&s.reviewOverrideKey&&s.reviewOverrideKey===snapshot.assistantKey&&s.baseline?.assistantKey===snapshot.assistantKey);
      if(!instruction&&!review&&((s.lastHandled===snapshot.assistantKey&&!kick)||s.lastClaim?.assistantKey===snapshot.assistantKey))return {ok:false,reason:'already handled'};
      if(!instruction&&(s.limitMode||(await config()).limitMode)!=='unlimited'&&(s.turns||0)>=(s.maxTurns||(await config()).maxTurns)){await pause(m.id,'Maximum auto-continue count reached.');return {ok:false,reason:'limit reached'};}
      let initial;if(instruction){initial=await MissionSignal.claimInstruction(m.id);if(!initial)return {ok:false,reason:'Instruction not ready or already attempted'};}
      else{const gate=await MissionSignal.beforeContinuation(m.id);if(!gate.ok){await pause(m.id,gate.completed?'Remote mission completed.':gate.error,gate.completed?'COMPLETED':'PAUSED');return {ok:false,reason:'mission gate'};}}
      // Persist before interacting with the page. No automatic retries on uncertainty.
      const claim={assistantKey:snapshot.assistantKey,assistantSig:snapshot.assistantSig,kind:instruction?'instruction':'continuation',claimedAt:Date.now(),token:initial?.token||`${Date.now()}-${Math.random().toString(36).slice(2)}`};
      await write(m.id,{...s,state:'SENDING',turns:(s.turns||0)+(instruction?0:1),lastClaim:claim,lastHandled:claim.assistantKey,kickoffRequested:false,reviewRequired:false,reviewOverrideKey:null,lastError:'',waitingSince:Date.now(),lastActivity:Date.now()});
      return {ok:true,token:claim.token,message:initial?.message||String(s.override||(await config()).message||'go').trim()};
    }
    if(m.type==='ABORT_UNSENT'){
      if(s.state!=='SENDING'||s.lastClaim?.token!==m.token||m.clicked!==false)return {ok:false};
      // This must be called only before the click path; no send attempt can have occurred.
      if(s.lastClaim.kind==='instruction'&&!await MissionSignal.releaseUnsentInstruction(m.id,m.token))return {ok:false};
      await write(m.id,{...s,enabled:false,state:'PAUSED',lastClaim:null,lastHandled:null,lastError:'Submission was not clicked. Review or clear the draft; Start can retry safely.'});
      return {ok:true};
    }
    if(m.type==='CONFIRM_SENT'){
      if(s.state!=='SENDING'||!s.lastClaim||s.lastClaim.token!==m.token)return {ok:false,reason:'stale claim'};
      if(s.lastClaim.kind==='instruction'&&!await MissionSignal.acknowledgeInstruction(m.id,m.token))return {ok:false,reason:'Mission instruction acknowledgment is uncertain'};
      await write(m.id,{...s,state:'AWAITING_REPLY',waitingSince:Date.now(),lastActivity:Date.now()});
      const mission=await MissionSignal.get(m.id);if(mission.mode==='mission'&&mission.connection==='disconnected'&&(mission.offlineAttempts||0)>=5)await pause(m.id,'Mission Signal disconnected. Five offline attempts exhausted.');return {ok:true};
    }
    if(m.type==='PAUSE'){await pause(m.id,m.reason||'Paused',m.state);return {ok:true};}
    if(m.type==='RELOAD'){
      if(!(await config()).autoReload || Date.now()-(s.state==='AWAITING_REPLY'?(s.waitingSince||s.lastActivity):s.lastActivity)<(await config()).stallSeconds*1000 || !['GENERATING','AWAITING_REPLY'].includes(s.state)||s.recoveryCount>=1)return {ok:false,reason:'not recoverable'};
      await write(m.id,{...s,state:'RECOVERING',recoveryCount:1,lastError:'One recovery reload attempted; inspect page and re-enable manually.'});
      await chrome.tabs.reload(sender.tab.id);return {ok:true};
    }
    return {ok:false,reason:'unknown message'};
  });
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{dispatch(m,sender).then(respond).catch(e=>respond({ok:false,error:String(e?.message||e)}));return true;});
chrome.runtime.onInstalled.addListener(async details=>{
  const defaults=await config();await chrome.storage.local.set({settings:defaults});
  const saved=await chrome.storage.local.get(null);
  for(const [k,v] of Object.entries(saved))if(k.startsWith('chat:')&&v)await chrome.storage.local.set({[k]:{...v,limitMode:v.limitMode||'limited',maxTurns:clamp(v.maxTurns,1,Number.MAX_SAFE_INTEGER,defaults.maxTurns)}});
  if(details.reason==='update'){
    const all=await chrome.storage.local.get(null);
    for(const [k,v] of Object.entries(all)) if(k.startsWith('chat:')&&v?.enabled)await pause(k.slice(5),'Extension updated. Re-enable after reviewing the conversation.');
  }
  await alarm();
});
chrome.runtime.onStartup.addListener(async()=>{const all=await chrome.storage.local.get(null);for(const [k,v] of Object.entries(all))if(k.startsWith('chat:')&&v?.enabled)await serial(k.slice(5),()=>pause(k.slice(5),'Browser restarted. Press Start to resume.'));await alarm();});
// Do not recreate alarm on every worker wakeup. Re-establish only if Chrome dropped it.
chrome.alarms.get(ALARM).then(existing=>{if(!existing)return alarm();}).catch(()=>{});
chrome.alarms.onAlarm.addListener(async a=>{
  if(a.name!==ALARM)return;
  const saved=await chrome.storage.local.get(null);await Promise.allSettled(Object.entries(saved).filter(([key,s])=>key.startsWith('chat:')&&(s?.enabled||saved['mission:'+key.slice(5)]?.connection==='disconnected')).map(([key])=>serial(key.slice(5),async()=>{const id=key.slice(5);const m=await MissionSignal.synchronize(id,true);if(m.mode==='mission'&&m.state==='COMPLETED')await pause(id,'Remote mission completed.','COMPLETED');})));
  const tabs=await chrome.tabs.query({url:'https://chatgpt.com/*'});
  await Promise.allSettled(tabs.map(async t=>{if(t.id!=null)await chrome.tabs.sendMessage(t.id,{type:'TICK'});}));
});
chrome.tabs.onRemoved.addListener(async tabId=>{
  const all=await chrome.storage.local.get(null);
  for(const [k,v] of Object.entries(all)) if(k.startsWith('chat:')&&v?.enabled&&v.ownerTabId===tabId)await serial(k.slice(5),()=>pause(k.slice(5),'Owner tab closed.'));
});
chrome.tabs.onUpdated.addListener(async(tabId,changes)=>{
  if(!changes.url)return;
  const all=await chrome.storage.local.get(null);
  for(const [k,v] of Object.entries(all)) if(k.startsWith('chat:')&&v?.enabled&&v.ownerTabId===tabId&&!tabMatches(changes.url,k.slice(5)))await serial(k.slice(5),()=>pause(k.slice(5),'Owner tab navigated away.'));
});
