'use strict';
const $=id=>document.getElementById(id);
const ask=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||r?.reason||'Controller unavailable');return r;};
const getId=url=>{try{const u=new URL(url);return u.origin==='https://chatgpt.com'?u.pathname.match(/^(?:\/g\/[^/]+)?\/c\/([\w-]{10,})\/?$/)?.[1]||null:null;}catch{return null;}};
let tab,id,session,settings,mission=null,missionHistory=[],noticeHistory=[],health=null,dirty=false,saving=false,ready=false,scope='chat';
let refreshing=false,refreshQueued=false,refreshTimer=null,closed=false;
const active=()=>Boolean(session?.enabled&&session.ownerTabId===tab?.id);
const occupied=()=>Boolean(session?.enabled&&session.ownerTabId!==tab?.id);
const notify=(text,error=false)=>{$('flash').textContent=text;$('flash').className=error?'error':'';};
const guard=fn=>async()=>{try{await fn();}catch(e){notify(e.message,true);}};
const limitOf=s=>mission?.mode==='local'||!mission?.mode?({mode:s?.localLimitMode||s?.limitMode||settings.limitMode||'limited',count:s?.localMaxTurns||s?.maxTurns||settings.maxTurns||2}):({mode:s?.limitMode||'unlimited',count:s?.missionMaxTurns||s?.maxTurns||20});
const progressOf=s=>{const l=limitOf(s),n=s?.turns||0;return l.mode==='unlimited'?n+' continuations · Unlimited ∞':n+' / '+l.count+' continuations';};
// A stored enabled flag is not proof that the page controller is operational.
async function probe(tabId,chatId,s){
  if(!s?.enabled)return null;let timer;
  try{
    const r=await Promise.race([chrome.tabs.sendMessage(tabId,{type:'PROBE'}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1400);})]);
    return r?.ok&&r.id===chatId&&r.operational&&(!s.documentId||s.documentId===r.documentId)?r:null;
  }catch{return null;}finally{clearTimeout(timer);}
}
function statusOf(s,runtime,m){
  if(m?.mode==='mission'&&m.state==='CANCELLED')return 'Cancelled';
  if(!s?.enabled){if(s?.state==='COMPLETED')return 'Completed';if(['NEEDS_USER','ERROR'].includes(s?.state))return 'Needs attention';return s?.state==='PAUSED'?'Paused':'Off';}
  if(!runtime)return 'Needs attention';if(m?.mode==='mission'&&m.connection==='disconnected')return 'Recovery';if(runtime.busy)return 'Generating';
  return {ARMING:'Checking',GENERATING:'Generating',SETTLING:'Settling',READY:'Ready',SENDING:'Sending',AWAITING_REPLY:'Waiting',RECOVERING:'Recovering'}[s.state]||'Running';
}
function sourceLabel(){
  $('messageSource').textContent=scope==='global'?'Default for all chats':session?.override?'Custom message for this chat':'Using global default';
  $('restore').hidden=scope==='global'||!session?.override;$('restore').disabled=occupied();
}
function paint(){
  const on=active(),other=occupied(),state=session?.state||'IDLE',status=statusOf(session,health,mission),l=limitOf(session),remoteDone=mission?.mode==='mission'&&mission.state==='COMPLETED';
  $('missionMode').value=mission?.mode||'local';$('missionMode').disabled=!id||Boolean(session?.enabled)||saving;
  $('missionStatus').textContent=mission?.mode!=='mission'?'Local Only · no server required':remoteDone?'Connected · mission completed':mission.state==='CANCELLED'?'Mission cancelled':mission.connection==='disconnected'?'Disconnected · '+(mission.offlineAttempts||0)+'/5':mission.id?'Connected · '+(mission.instructionState==='sent'?'instruction delivered':mission.instructionState==='claimed'?'instruction needs review':'instruction pending'):'Mission registers when started';
  const notices=noticeHistory.map(entry=>({...entry,kind:'notice'}));
  const previousMissions=missionHistory.filter(entry=>!noticeHistory.some(n=>n.missionId===entry.id&&n.state===entry.state))
    .map(entry=>({...entry,kind:'mission'}));
  const history=[...notices,...previousMissions].sort((a,b)=>(b.recordedAt||0)-(a.recordedAt||0)).slice(0,20);
  $('missionHistoryPanel').hidden=!history.length;
  $('missionHistoryCount').textContent=String(history.length);
  $('missionHistoryItems').replaceChildren(...history.map(entry=>{
    const row=document.createElement('div');row.className='mission-history-row';
    const when=Number.isFinite(entry.recordedAt)?new Date(entry.recordedAt).toLocaleString():'';
    const source=entry.kind==='notice'?(entry.mode==='mission'?'Mission Signal':'Local Only'):'Mission Signal';
    const detail=entry.kind==='notice'?([entry.missionId,entry.reason].filter(Boolean).join(' · ')):(entry.id||'');
    row.textContent=`${source} · ${entry.state} · ${when}${detail?' · '+detail:''}`;
    row.title=entry.missionId||entry.id||'';
    return row;
  }));
  $('missionIdentity').hidden=!mission?.id;$('missionIdentity').textContent=mission?.id?'Mission '+mission.id:'';
  $('newMission').hidden=mission?.mode!=='mission'||!mission?.id||Boolean(session?.enabled);$('newMission').disabled=saving;
  $('missionActions').hidden=mission?.mode!=='mission'||!mission?.id;
  $('missionCapSettings').hidden=mission?.mode!=='mission';
  $('missionCap').checked=Boolean(session?.missionCapEnabled);
  if(document.activeElement!==$('missionCapNumber'))$('missionCapNumber').value=session?.missionMaxTurns||20;
  $('missionCap').disabled=Boolean(session?.enabled)||other||saving;
  $('missionCapNumber').disabled=Boolean(session?.enabled)||other||saving||!session?.missionCapEnabled;
  $('resumeMission').disabled=Boolean(session?.enabled)||other||saving||remoteDone||mission?.state==='CANCELLED'||mission?.instructionState!=='sent';
  $('cancelMission').disabled=other||saving||remoteDone||mission?.state==='CANCELLED';
  $('status').textContent=other&&health?'Other tab':status;
  $('status').className='badge '+(['Needs attention','Recovery'].includes(status)?'attention':session?.enabled&&health?'running':status==='Paused'?'paused':'');
  $('turns').textContent=mission?.mode==='mission'?(session?.missionCapEnabled?(session?.turns||0)+' / '+(session?.maxTurns||settings.maxTurns):(session?.turns||0)+' · ∞'):l.mode==='unlimited'?(session?.turns||0)+' · ∞':(session?.turns||0)+' / '+l.count;
  $('limitProgress').textContent=progressOf(session);
  if(document.activeElement!==$('limitMode'))$('limitMode').value=l.mode;
  if(document.activeElement!==$('maxTurns'))$('maxTurns').value=l.count;
  const missionMode=mission?.mode==='mission';
  $('limitCard').hidden=missionMode;
  $('modeHint').textContent=missionMode?'Mission Signal sends one setup instruction, then stops on verified completion. Offline safety: 5 attempts. Optional cap: Advanced settings.':'Local Only waits for an eligible reply and stops at your selected continuation limit.';
  $('limitMode').value=missionMode?'unlimited':l.mode;
  $('limitNumberLabel').hidden=missionMode||l.mode==='unlimited';
  $('limitMode').disabled=missionMode||!id||other||saving;
  $('maxTurns').disabled=missionMode||!id||other||saving;
  $('limitProgress').textContent=missionMode?(session?.turns||0)+(session?.missionCapEnabled?' / '+(session?.maxTurns||settings.maxTurns)+' safety cap':' continuations · stops on Mission Signal')+' · offline max 5':progressOf(session);
  const descriptions={ARMING:'Reading the current conversation…',OBSERVING:'Watching for the next finished reply.',GENERATING:'ChatGPT is working. Waiting for completion.',SETTLING:'Checking that the reply has finished.',READY:'Reply finished. Checking send safeguards.',SENDING:'Verifying continuation submission…',AWAITING_REPLY:'Continuation sent. Waiting for a reply.',RECOVERING:'Recovery requires your review.'};
  $('activity').textContent=remoteDone?'Mission completed successfully. Choose New mission to start another.':mission?.state==='CANCELLED'?'Mission cancelled. Choose New mission to start another.':session?.enabled&&!health?'Controller unavailable or page not ready. Review the owner tab.':other?'Running in another tab. This tab cannot send.':on?(health?.busy?descriptions.GENERATING:descriptions[state]||state):'Automation is paused. Start when you are ready.';
  $('lastError').hidden=remoteDone||!session?.lastError;$('lastError').textContent=remoteDone?'':session?.lastError||'';$('openOwner').hidden=!other;
  $('dismissReviewRow').hidden=!session?.reviewRequired||Boolean(session?.enabled)||session?.state!=='NEEDS_USER'||other;
  $('dismissReview').disabled=saving;
  const pausedReview=Boolean(session?.reviewRequired&&!session?.enabled&&state==='NEEDS_USER');
  $('reviewResumeRow').hidden=!session?.reviewRequired||other||remoteDone||(!on&&state!=='NEEDS_USER');
  $('reviewContinue').disabled=saving||Boolean(session?.reviewOverrideKey)||(!pausedReview&&(!on||!health||!['OBSERVING','AWAITING_REPLY'].includes(state)));
  $('toggleSession').disabled=!id||other||saving||remoteDone||pausedReview||(mission?.mode==='mission'&&mission.state==='CANCELLED');$('toggleSession').textContent=other?'Owned by another tab':on?'Pause':pausedReview?'Review required':'Start';$('toggleSession').classList.toggle('danger',on);
  $('kickoff').disabled=!on||!health||health.busy||state!=='OBSERVING'||Boolean(session?.lastClaim)||Boolean(session?.kickoffRequested)||(mission?.mode==='mission'&&mission.instructionState!=='sent')||saving;
  $('message').disabled=(other&&scope!=='global')||(scope!=='global'&&!id);sourceLabel();
}
async function refresh(initial=false){
  if(closed||(!ready&&!initial))return;if(refreshing){refreshQueued=true;return;}refreshing=true;
  try{
    const r=await ask({type:'STATUS',id});session=r.session;settings=r.settings;mission=r.mission;missionHistory=r.missionHistory||[];noticeHistory=r.noticeHistory||[];health=await probe(session?.ownerTabId,id,session);
    if(initial){
      $('conversation').textContent=id?(tab.title||'ChatGPT conversation').replace(/\s*[|–-]\s*ChatGPT\s*$/i,''):'Open a saved ChatGPT conversation';
      $('message').value=session?.override||settings.message;
      for(const k of ['settleSeconds','stallSeconds','watchdogSeconds'])$(k).value=settings[k];$('autoReload').checked=settings.autoReload;
      const c=await ask({type:'GET_MISSION_CONNECTION'});$('missionEndpoint').textContent=c.endpoint;$('missionConfigured').textContent=c.configured?'Enrollment key stored locally (not yet verified this session).':'Configure before selecting Mission Signal.';
    }else if(!dirty&&!saving&&document.activeElement!==$('message'))$('message').value=scope==='global'?settings.message:session?.override||settings.message;
    paint();await renderTabs($('tabsPanel').open);
  }finally{refreshing=false;if(refreshQueued&&!closed){refreshQueued=false;scheduleRefresh();}}
}
function scheduleRefresh(){if(refreshTimer||closed)return;refreshTimer=setTimeout(()=>{refreshTimer=null;guard(()=>refresh())();},120);}
async function saveMessage(){
  if(!dirty||saving)return;saving=true;paint();
  try{if(scope==='global')await ask({type:'SET_SETTINGS',settings:{message:$('message').value}});else await ask({type:'SAVE_MESSAGE',id,tabId:tab.id,override:$('message').value.trim()===settings.message?'':$('message').value});dirty=false;notify('Message saved.');}
  finally{saving=false;await refresh();}
}
async function saveLimit(){
  const count=Number($('maxTurns').value);if(!Number.isSafeInteger(count)||count<1)throw Error('Enter a positive whole-number continuation limit.');
  await ask({type:'SET_LIMIT',id,tabId:tab.id,limitMode:$('limitMode').value,maxTurns:count});await refresh();notify('Conversation limit saved. Counter preserved.');
}
async function wake(target){let timer;try{await Promise.race([chrome.tabs.sendMessage(target,{type:'TICK'}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Controller unavailable')),1400);})]);}catch{notify('Settings saved, but the controller is unavailable. Review or refresh that tab.',true);}finally{clearTimeout(timer);}}
async function toggle(chatId,target,enabled){await ask({type:'SET_SESSION',id:chatId,tabId:target,enabled});await wake(target);await refresh();}
async function focusTab(targetId){const t=await chrome.tabs.get(targetId);await chrome.tabs.update(targetId,{active:true});await chrome.windows.update(t.windowId,{focused:true});window.close();}
$('message').addEventListener('input',()=>{dirty=true;notify('Unsaved · leave the field to save');});
$('message').addEventListener('change',guard(saveMessage));
$('scope').addEventListener('change',guard(async()=>{const next=$('scope').value;$('scope').value=scope;await saveMessage();scope=next;$('scope').value=next;$('message').value=scope==='global'?settings.message:session?.override||settings.message;paint();}));
$('restore').onclick=guard(async()=>{await ask({type:'SAVE_MESSAGE',id,tabId:tab.id,override:''});dirty=false;$('message').value=settings.message;await refresh();notify('Using global default.');});
$('limitMode').addEventListener('change',guard(saveLimit));$('maxTurns').addEventListener('change',guard(saveLimit));
$('toggleSession').onclick=guard(async()=>{if(active())await toggle(id,tab.id,false);else{await saveMessage();await toggle(id,tab.id,true);}});
$('dismissReview').onclick=guard(async()=>{
  if(!confirm('Dismiss the outdated approval warning? This does NOT grant permission, complete an external action, or send a message.'))return;
  await ask({type:'DISMISS_REVIEW',id,tabId:tab.id});
  await refresh();notify('Approval warning dismissed. No message was sent.');
});
$('reviewContinue').onclick=guard(async()=>{
  if(!confirm('I have completed the requested human action and reviewed the latest assistant response. Authorize exactly ONE continuation of this same reply?'))return;
  await ask({type:'REQUEST_REVIEW_CONTINUE',id,tabId:tab.id});await wake(tab.id);await refresh();notify('One reviewed continuation authorized. No duplicate sends.');
});
$('kickoff').onclick=guard(async()=>{await saveMessage();await ask({type:'REQUEST_KICKOFF',id,tabId:tab.id});await wake(tab.id);await refresh();notify('One continuation requested.');});
$('openOwner').onclick=guard(()=>focusTab(session.ownerTabId));
$('missionMode').onchange=guard(async()=>{await ask({type:'SET_MISSION_MODE',id,tabId:tab.id,mode:$('missionMode').value});await refresh();notify('Completion mode saved.');});
$('newMission').onclick=guard(async()=>{
  if(mission?.state==='ACTIVE'){notify('Cancel the active mission first to prevent an orphan mission.',true);return;}
  if(!confirm('Create a new mission? Review the transcript and clear any old instruction draft before Start.'))return;
  await ask({type:'NEW_MISSION',id,tabId:tab.id});await refresh();notify('New mission prepared.');
});
$('cancelMission').onclick=guard(async()=>{
  if(!confirm('Cancel this Mission Signal on homeserver and stop its automation? This cannot be resumed.'))return;
  await ask({type:'CANCEL_MISSION',id,tabId:tab.id});await refresh();notify('Mission cancellation confirmed.');
});
$('resumeMission').onclick=guard(async()=>{
  await ask({type:'RESUME_MISSION',id,tabId:tab.id});await wake(tab.id);await refresh();notify('Existing mission resumed.');
});
async function saveMissionCap(){
  await ask({type:'SET_MISSION_CAP',id,tabId:tab.id,enabled:$('missionCap').checked,maxTurns:Number($('missionCapNumber').value)});
  await refresh();notify('Mission safety cap saved.');
}
$('missionCap').addEventListener('change',guard(saveMissionCap));
$('missionCapNumber').addEventListener('change',guard(saveMissionCap));
$('missionConnectionForm').onsubmit=e=>{e.preventDefault();guard(async()=>{await ask({type:'SET_MISSION_CONNECTION',enrollment:$('enrollment').value});$('enrollment').value='';const c=await ask({type:'GET_MISSION_CONNECTION'});$('missionConfigured').textContent=c.configured?'Enrollment key verified and saved.':'Enrollment key not configured.';notify('Enrollment verified by homeserver and saved.');})();};
$('settingsForm').onsubmit=e=>{e.preventDefault();guard(async()=>{const next={};for(const k of ['settleSeconds','stallSeconds','watchdogSeconds'])next[k]=$(k).value;next.autoReload=$('autoReload').checked;await ask({type:'SET_SETTINGS',settings:next});await refresh();notify('Settings saved.');})();};
async function renderTabs(expanded){
  const tabs=await chrome.tabs.query({url:'https://chatgpt.com/*'}),groups=new Map();
  for(const t of tabs){
    const chatId=getId(t.url);
    if(chatId&&chatId!==id){
      if(!groups.has(chatId))groups.set(chatId,[]);
      groups.get(chatId).push(t);
    }
  }
  $('tabCount').textContent=String(groups.size);
  if(!expanded)return;
  const list=$('tabList');
  if(!groups.size){
    if(list.childElementCount!==1||!list.firstElementChild?.classList.contains('muted')){
      const empty=document.createElement('div');empty.className='muted';
      empty.textContent='No other conversations open.';list.replaceChildren(empty);
    }
    return;
  }
  const existing=new Map([...list.querySelectorAll('.tab-item')].map(el=>[el.dataset.conversationId,el]));
  const entries=await Promise.all([...groups].map(async([chatId,group])=>{
    const r=await ask({type:'STATUS',id:chatId});
    const s=r.session,target=group.find(t=>t.id===s?.ownerTabId)||group[0];
    return {chatId,group,s,mission:r.mission,target,runtime:await probe(s?.ownerTabId,chatId,s)};
  }));
  const present=new Set();
  for(let index=0;index<entries.length;index++){
    const {chatId,group,s,mission:otherMission,target,runtime}=entries[index];
    present.add(chatId);
    let row=existing.get(chatId);
    if(!row){
      row=document.createElement('div');row.className='tab-item';row.dataset.conversationId=chatId;
      const info=document.createElement('div');info.className='tab-info';
      const title=document.createElement('button');title.className='tab-title';
      const progress=document.createElement('span');progress.className='small';
      info.append(title,progress);
      const state=document.createElement('span');state.className='tab-state';state.setAttribute('role','status');
      const action=document.createElement('button');action.className='tab-toggle';
      row.append(info,state,action);
    }
    const info=row.children[0],title=info.children[0],progress=info.children[1];
    const state=row.children[1],action=row.children[2];
    const name=target.title||'ChatGPT conversation';
    if(title.textContent!==name)title.textContent=name;
    title.title=name;
    title.onclick=guard(()=>focusTab(target.id));
    const progressText=progressOf(s)+(group.length>1?' · '+group.length+' tabs · one owner':'');
    if(progress.textContent!==progressText)progress.textContent=progressText;
    const stateText=statusOf(s,runtime,otherMission);
    if(state.textContent!==stateText)state.textContent=stateText;
    const actionText=s?.enabled?'Pause':'Start';
    if(action.textContent!==actionText)action.textContent=actionText;
    const aria=(s?.enabled?'Pause ':'Start ')+name;
    if(action.getAttribute('aria-label')!==aria)action.setAttribute('aria-label',aria);
    if(!action.dataset.pending){
      action.onclick=guard(async()=>{
        action.dataset.pending='true';action.disabled=true;
        try{await toggle(chatId,target.id,!s?.enabled);}
        finally{delete action.dataset.pending;action.disabled=false;}
      });
    }
    if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
  }
  for(const [chatId,row] of existing){
    if(!present.has(chatId))row.remove();
  }
  for(const item of [...list.children]){
    if(!item.classList.contains('tab-item'))item.remove();
  }
}
$('diagnosticsPanel').addEventListener('toggle',()=>{if($('diagnosticsPanel').open)guard(async()=>{
 const r=await ask({type:'GET_DIAGNOSTICS',id});
 $('diagnosticsSummary').textContent=r.entries.length+' events · '+r.sessionState;
})()});
$('copyDiagnostics').onclick=guard(async()=>{
 const r=await ask({type:'GET_DIAGNOSTICS',id});
 const report=JSON.stringify({schema:1,version:r.version,mode:r.mode,sessionState:r.sessionState,enabled:r.enabled,events:r.entries},null,2);
 await navigator.clipboard.writeText(report);
 notify('Diagnostic report copied. It contains no chat content or enrollment secrets.');
});
$('clearDiagnostics').onclick=guard(async()=>{
 if(!confirm('Clear diagnostic events for this chat? This will not change the session or mission.'))return;
 await ask({type:'CLEAR_DIAGNOSTICS',id});
 $('diagnosticsSummary').textContent='0 events';
 notify('Diagnostics cleared.');
});
$('tabsPanel').addEventListener('toggle',()=>{if($('tabsPanel').open)guard(()=>renderTabs(true))();});
chrome.storage.onChanged.addListener(scheduleRefresh);
const popupTimer=setInterval(scheduleRefresh,2500);
window.addEventListener('pagehide',()=>{closed=true;clearInterval(popupTimer);clearTimeout(refreshTimer);});
(async()=>{[tab]=await chrome.tabs.query({active:true,currentWindow:true});id=getId(tab?.url);await refresh(true);ready=true;})().catch(e=>notify(e.message,true));
