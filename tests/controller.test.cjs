'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'..');const CHAT='aaaaaaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';const URL=`https://chatgpt.com/c/${CHAT}`;
function harness(){
 let tickListener,extensionMessages,removed,updated, installed,startup;let clock=1000000;let tabList=[{id:10,url:URL}],storage={};
 const listeners={};const clone=x=>structuredClone(x);
 const store={get:async ks=>{if(ks===null)return clone(storage);const keys=Array.isArray(ks)?ks:[ks];return Object.fromEntries(keys.filter(k=>Object.hasOwn(storage,k)).map(k=>[k,clone(storage[k])]))},set:async entries=>{Object.assign(storage,clone(entries));}};
 const chrome={storage:{local:store},alarms:{create:async()=>{},get:async()=>null,onAlarm:{addListener:f=>tickListener=f}},runtime:{onMessage:{addListener:f=>extensionMessages=f},onInstalled:{addListener:f=>installed=f},onStartup:{addListener:f=>startup=f}},tabs:{get:async id=>{const t=tabList.find(t=>t.id===id);if(!t)throw Error('tab missing');return clone(t)},reload:async id=>{listeners.reloaded=id},query:async()=>clone(tabList),sendMessage:async()=>{},onRemoved:{addListener:f=>removed=f},onUpdated:{addListener:f=>updated=f}}};
 const bg={chrome,crypto:require('node:crypto').webcrypto,AbortSignal,fetch:globalThis.fetch,importScripts:file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),bg,{filename:file}),Date:class extends Date {static now(){return clock}},Map,Math,Promise,console,URL:globalThis.URL};vm.createContext(bg);vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),bg,{filename:'background.js'});
 const rpc=(msg,tab=null)=>new Promise(resolve=>extensionMessages(msg,tab?{tab:clone(tab)}:{},resolve));
 function updateClock(ms){clock+=ms;}
 function fakePage(tab=tabList[0],chat=CHAT){
   const entries=[message('user','old user','user-1'),message('assistant','old assistant','assistant-1')];let next=1;
   const classT=class {set value(v){this._value=v}get value(){return this._value||''}};
   const editor=Object.assign(new classT(),{tagName:'TEXTAREA',focus:()=>{},dispatchEvent:()=>{sendBtn.disabled=!editor.value.trim();}});
   const sendBtn={disabled:true,hidden:false,getClientRects:()=>[1],getAttribute(k){return {'data-testid':'send-button','aria-label':'Send prompt'}[k]||null;},click(){if(this.disabled)return;const value=editor.value;page.sent.push(value);entries.push(message('user',value,`user-${++next}`));editor.value='';this.disabled=true;stopBtn.hidden=true;if(page.onSend)page.onSend(value);}};
   const stopBtn={disabled:false,hidden:true,getClientRects(){return this.hidden?[]:[1]},getAttribute(k){return {'data-testid':'stop-button','aria-label':'Stop generating'}[k]||null;}};
   const page={sent:[],entries,sendBtn,stopBtn,editor,onSend:null,user(txt){entries.push(message('user',txt,`user-${++next}`));},assistant(txt,busy=false){entries.push(message('assistant',txt,`assistant-${++next}`));stopBtn.hidden=!busy;},finish(txt){const a=entries.filter(e=>e.role==='assistant').at(-1);a.innerText=txt;stopBtn.hidden=true},draft(txt){editor.value=txt;editor.dispatchEvent();}};
   const doc={documentElement:{},querySelectorAll(sel){if(sel.includes('data-message-author-role'))return entries; if(sel==='button')return [sendBtn,stopBtn];return []},querySelector(sel){if(sel.includes('prompt-textarea')||sel.includes('composer-text-input'))return editor;if(sel.includes('thinking-indicator')&&page.toolBusy)return {};return null},addEventListener:()=>{},execCommand:()=>false};
   let onTick;const contentChrome={runtime:{sendMessage:async m=>rpc(m,tab),onMessage:{addListener:f=>onTick=f}}};
   const ctx={chrome:contentChrome,document:doc,location:{pathname:`/c/${chat}`,href:tab.url},window:{addEventListener:()=>{}},Date:class extends Date {static now(){return clock}},console,Math,Promise,HTMLTextAreaElement:classT,Event:class {constructor(){}},InputEvent:class {},MutationObserver:class{observe(){}},setInterval:()=>3,setTimeout:(f)=>{setImmediate(f);return 5}};
   vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'content.js'),'utf8'),ctx,{filename:'content.js'});
   async function tick(){await new Promise(resolve=>onTick({type:'TICK'},null,resolve));}
   return {page,tick};
 }
 return {rpc,fakePage,updateClock,storage,tabList,setFetch(fn){bg.fetch=fn;},restart(){const ctx={...bg};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),ctx);},events:{startup:async()=>startup(),removed:async id=>removed(id),updated:async(id,url)=>updated(id,{url}),installed:async detail=>installed(detail)},owner:{id:10,url:URL},other:{id:11,url:URL}};
}
function message(role,txt,id){return {role,innerText:txt,getAttribute(k){return {'data-message-author-role':role,'data-message-id':id,'data-complete':'true'}[k]||null},closest:()=>null};}
async function activate(h){const r=await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:true,override:''});if(!r.ok)console.log('activation error:',r);assert.equal(r.ok,true);}
const s=h=>h.rpc({type:'STATUS',id:CHAT});
test('manifest metadata, permissions, test structure',()=>{const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));assert.equal(m.version,'0.6.0');assert.equal(m.manifest_version,3);assert.deepEqual(m.host_permissions,['https://chatgpt.com/*','https://mission-signal.synovaq.org/*']);assert.deepEqual(m.permissions,['storage','alarms','tabs']);});
test('activation never sends against an old answer',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();h.updateClock(12000);await c.tick();assert.deepEqual(c.page.sent,[]);assert.equal((await s(h)).session.lastHandled,'assistant-1');});
test('waits for a finished response, sends once, then a next response, respects cap',async()=>{
 const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('start');c.page.assistant('partial',true);await c.tick();h.updateClock(12000);await c.tick();assert.deepEqual(c.page.sent,[]);
 c.page.finish('Finished step 1, more to do.');await c.tick();h.updateClock(7000);await c.tick();assert.deepEqual(c.page.sent,['go']);await c.tick();assert.deepEqual(c.page.sent,['go']);
 c.page.assistant('Finished step 2, more to do.');await c.tick();h.updateClock(7000);await c.tick();assert.deepEqual(c.page.sent,['go','go']);
 c.page.assistant('More work remains.');await c.tick();h.updateClock(7000);await c.tick();assert.deepEqual(c.page.sent,['go','go']);assert.equal((await s(h)).session.state,'PAUSED');
});
test('conversation override is sent, without mutating global default',async()=>{const h=harness(),c=h.fakePage();await h.rpc({type:'SET_SETTINGS',settings:{message:'go'}});await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:true,override:'Follow the roadmap'});await c.tick();c.page.user('next');c.page.assistant('Working',true);await c.tick();c.page.finish('Ready to proceed.');await c.tick();h.updateClock(7000);await c.tick();assert.deepEqual(c.page.sent,['Follow the roadmap']);assert.equal((await s(h)).settings.message,'go');});
test('composer draft and approval cause pause, no messages',async()=>{for(const mode of ['draft','approval']){const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('next');c.page.assistant('Working',true);await c.tick();c.page.finish(mode==='approval'?'Please approve this operation.':'Ready for next.');if(mode==='draft')c.page.draft('Human is typing');await c.tick();h.updateClock(7000);await c.tick();assert.deepEqual(c.page.sent,[]);assert.equal((await s(h)).session.state,mode==='approval'?'NEEDS_USER':'PAUSED');}});
test('unknown message selectors fail closed; no automatic send',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('next');c.page.assistant('Working',true);await c.tick();c.page.finish('Ready');await c.tick();h.updateClock(7000);c.page.sendBtn.getAttribute=()=>null;await c.tick();assert.equal((await s(h)).session.state,'PAUSED');assert.deepEqual(c.page.sent,[]);});
test('duplicate claim serialized and never repeats same assistant key',async()=>{const h=harness();await activate(h);await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'a-0',assistantSig:'s0'}},h.owner);const call={type:'CLAIM_SEND',id:CHAT,snapshot:{assistantKey:'a-2',assistantSig:'sig-2'}};const results=await Promise.all([h.rpc(call,h.owner),h.rpc(call,h.owner)]);assert.equal(results.filter(x=>x.ok).length,1);assert.equal((await s(h)).session.turns,1);});
test('wrong owner denied; double-tab conflict denied; navigation pause',async()=>{const h=harness();h.tabList.push(h.other);await activate(h);const other=await h.rpc({type:'SET_SESSION',id:CHAT,tabId:11,enabled:true});assert.equal(other.ok,false);const attempt=await h.rpc({type:'PAUSE',id:CHAT,reason:'bad'},h.other);assert.equal(attempt.ok,false);await h.events.updated(10,'https://chatgpt.com/c/zzzzzzzzzzzzz');assert.equal((await s(h)).session.enabled,false);});
test('refresh only on matching stalled state and exactly once',async()=>{const h=harness();await activate(h);await h.rpc({type:'SET_SETTINGS',settings:{autoReload:true}});await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'a',assistantSig:'sig',busy:true}},h.owner);h.updateClock(181000);const r=await h.rpc({type:'RELOAD',id:CHAT},h.owner);assert.equal(r.ok,true);assert.equal((await s(h)).session.state,'RECOVERING');assert.equal((await h.rpc({type:'RELOAD',id:CHAT},h.owner)).ok,false);});
test('session disabled on extension upgrade',async()=>{const h=harness();await activate(h);await h.events.installed({reason:'update'});assert.equal((await s(h)).session.enabled,false);});
test('failed Send click is paused, never blindly retried',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('continue');c.page.assistant('Working...',true);await c.tick();c.page.finish('Ready for next step.');await c.tick();c.page.sendBtn.click=()=>{};h.updateClock(7000);await c.tick();const st=(await s(h)).session;assert.equal(st.state,'PAUSED');assert.equal(st.turns,1);assert.deepEqual(c.page.sent,[]);assert.match(st.lastError,/No new submitted user message/);});
test('manual switch off prevents all future sends',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:false});c.page.user('question');c.page.assistant('answer',false);h.updateClock(20000);await c.tick();assert.deepEqual(c.page.sent,[]);assert.equal((await s(h)).session.state,'PAUSED');});
test('does not send for a final roadmap reply',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('last step');c.page.assistant('Working...',true);await c.tick();c.page.finish('The roadmap is fully complete.');await c.tick();h.updateClock(8000);await c.tick();assert.deepEqual(c.page.sent,[]);assert.equal((await s(h)).session.state,'COMPLETED');});
test('does not send when ChatGPT reports usage limits',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('question');c.page.assistant('Working...',true);await c.tick();c.page.finish("You've reached your limit. Try again later.");await c.tick();h.updateClock(8000);await c.tick();assert.deepEqual(c.page.sent,[]);assert.equal((await s(h)).session.state,'PAUSED');});
test('reopening an enabled conversation changes message without resetting count',async()=>{const h=harness();await activate(h);await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'a0',assistantSig:'s0'}},h.owner);const c={type:'CLAIM_SEND',id:CHAT,snapshot:{assistantKey:'a1',assistantSig:'s1'}};assert.ok((await h.rpc(c,h.owner)).ok);assert.ok((await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:true,override:'Next roadmap step'})).ok);const session=(await s(h)).session;assert.equal(session.turns,1);assert.equal(session.state,'SENDING');assert.equal(session.override,'Next roadmap step');});
test('explicit kickoff sends the first go for a preexisting finished response, only once',async()=>{
 const h=harness(),c=h.fakePage();await activate(h);await c.tick();
 const requested=await h.rpc({type:'REQUEST_KICKOFF',id:CHAT,tabId:10});assert.equal(requested.ok,true);
 h.updateClock(8000);await c.tick();assert.deepEqual(c.page.sent,['go']);
 assert.equal((await h.rpc({type:'REQUEST_KICKOFF',id:CHAT,tabId:10})).ok,false);
 h.updateClock(10000);await c.tick();assert.deepEqual(c.page.sent,['go']);
});
test('kickoff cannot be requested before baseline, by wrong tab, or while generating',async()=>{
 const h=harness();await activate(h);
 assert.equal((await h.rpc({type:'REQUEST_KICKOFF',id:CHAT,tabId:10})).ok,false);
 assert.equal((await h.rpc({type:'REQUEST_KICKOFF',id:CHAT,tabId:11})).ok,false);
 await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'a1',assistantSig:'s1',busy:true}},h.owner);
 assert.equal((await h.rpc({type:'REQUEST_KICKOFF',id:CHAT,tabId:10})).ok,false);
});

test('saved messages never activate or reset a conversation',async()=>{const h=harness();await h.rpc({type:'SAVE_MESSAGE',id:CHAT,tabId:10,override:'next'});assert.equal((await s(h)).session.enabled,false);await activate(h);const before=(await s(h)).session;await h.rpc({type:'SAVE_MESSAGE',id:CHAT,tabId:10,override:'another'});assert.equal((await s(h)).session.generation,before.generation);});
test('refresh pauses persisted session before another send',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();const fresh=h.fakePage();await new Promise(setImmediate);await fresh.tick();assert.equal((await s(h)).session.enabled,false);assert.match((await s(h)).session.lastError,/refreshed/);});
test('claim authorization revoked by pause',async()=>{const h=harness();await activate(h);await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'old'}},h.owner);const r=await h.rpc({type:'CLAIM_SEND',id:CHAT,snapshot:{assistantKey:'new',assistantSig:'sig'}},h.owner);assert.equal((await h.rpc({type:'CHECK_SEND',id:CHAT,token:r.token},h.owner)).ok,true);await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:false});assert.equal((await h.rpc({type:'CHECK_SEND',id:CHAT,token:r.token},h.owner)).ok,false);});
test('invalid stored settings normalize on read and carry schema version',async()=>{const h=harness();h.storage.settings={settleSeconds:-50,watchdogSeconds:'bad',maxTurns:999,autoReload:'false',message:''};const r=await s(h);assert.equal(r.settings.settleSeconds,3);assert.equal(r.settings.watchdogSeconds,30);assert.equal(r.settings.maxTurns,999);assert.equal(r.settings.autoReload,false);assert.equal(r.settings.message,'go');assert.equal(r.settings.schemaVersion,2);});
test('non-owner popup cannot pause or edit owner session',async()=>{const h=harness();h.tabList.push(h.other);await activate(h);assert.equal((await h.rpc({type:'SET_SESSION',id:CHAT,tabId:11,enabled:false})).ok,false);assert.equal((await h.rpc({type:'SAVE_MESSAGE',id:CHAT,tabId:11,override:'bad'})).ok,false);assert.equal((await s(h)).session.enabled,true);});
test('different conversation journals and counters remain isolated',async()=>{const h=harness();const id='bbbbbbbbbbbb-cccc-dddd-eeee-ffffffffffff';h.tabList.push({id:12,url:`https://chatgpt.com/c/${id}`});await activate(h);await h.rpc({type:'SET_SESSION',id,tabId:12,enabled:true,override:'second'});await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'old'}},h.owner);await h.rpc({type:'CLAIM_SEND',id:CHAT,snapshot:{assistantKey:'new',assistantSig:'sig'}},h.owner);const other=await h.rpc({type:'STATUS',id});assert.equal(other.session.turns,0);assert.equal(other.session.lastClaim,null);assert.equal(other.session.override,'second');});
test('owner closure pauses; recovery disabled by default',async()=>{const h=harness();await activate(h);await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'a',busy:true}},h.owner);h.updateClock(200000);assert.equal((await h.rpc({type:'RELOAD',id:CHAT},h.owner)).ok,false);await h.events.removed(10);assert.equal((await s(h)).session.enabled,false);});
test('missing final structural evidence never sends on silence',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('next');c.page.assistant('Partial tool result',true);await c.tick();c.page.finish('More output may follow');const a=c.page.entries.at(-1),original=a.getAttribute;a.getAttribute=k=>k==='data-complete'?null:original(k);await c.tick();h.updateClock(20000);await c.tick();assert.deepEqual(c.page.sent,[]);});
test('lost confirmation stays paused across subsequent ticks',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('next');c.page.assistant('Working',true);await c.tick();c.page.finish('Proceed');await c.tick();c.page.onSend=()=>{h.storage[`chat:${CHAT}`].lastClaim.token='lost'};h.updateClock(7000);await c.tick();h.updateClock(30000);await c.tick();assert.deepEqual(c.page.sent,['go']);assert.equal((await s(h)).session.enabled,false);});

test('stale activation cannot pause a restarted session',async()=>{const h=harness();await activate(h);const old=(await s(h)).session.generation;await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:false});await activate(h);assert.equal((await h.rpc({type:'PAUSE',id:CHAT,generation:old,reason:'late failure'},h.owner)).ok,false);assert.equal((await s(h)).session.enabled,true);});
test('service worker restart preserves write-ahead claim and duplicate protection',async()=>{const h=harness();await activate(h);await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'old'}},h.owner);const claim={type:'CLAIM_SEND',id:CHAT,snapshot:{assistantKey:'new',assistantSig:'sig'}};assert.equal((await h.rpc(claim,h.owner)).ok,true);h.restart();assert.equal((await h.rpc(claim,h.owner)).ok,false);assert.equal((await s(h)).session.turns,1);const c=h.fakePage();await new Promise(setImmediate);await c.tick();assert.equal((await s(h)).session.enabled,false);assert.deepEqual(c.page.sent,[]);});

test('per-conversation modes and limits persist across pause/start and worker restart',async()=>{const h=harness();await h.rpc({type:'SET_LIMIT',id:CHAT,tabId:10,limitMode:'unlimited',maxTurns:20});assert.equal((await s(h)).session.enabled,false);await activate(h);let st=(await s(h)).session;assert.equal(st.limitMode,'unlimited');assert.equal(st.maxTurns,20);await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:false});h.restart();await activate(h);st=(await s(h)).session;assert.equal(st.limitMode,'unlimited');assert.equal(st.maxTurns,20);});
test('Unlimited has no arbitrary count ceiling; safety pause and ownership still apply',async()=>{const h=harness();await activate(h);await h.rpc({type:'SET_LIMIT',id:CHAT,tabId:10,limitMode:'unlimited',maxTurns:2});await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'old'}},h.owner);h.storage['chat:'+CHAT].turns=1000000;const r=await h.rpc({type:'CLAIM_SEND',id:CHAT,snapshot:{assistantKey:'new',assistantSig:'sig'}},h.owner);assert.equal(r.ok,true);assert.equal((await s(h)).session.turns,1000001);await h.rpc({type:'PAUSE',id:CHAT,reason:'Approval required',state:'NEEDS_USER'},h.owner);assert.equal((await h.rpc({type:'CHECK_SEND',id:CHAT,token:r.token},h.owner)).ok,false);});
test('changing Limited/Unlimited preserves counter, activation and send journal',async()=>{const h=harness();await activate(h);await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'old'}},h.owner);const r=await h.rpc({type:'CLAIM_SEND',id:CHAT,snapshot:{assistantKey:'new',assistantSig:'sig'}},h.owner);await h.rpc({type:'CONFIRM_SENT',id:CHAT,token:r.token},h.owner);const before=(await s(h)).session;for(const mode of ['unlimited','limited']){assert.equal((await h.rpc({type:'SET_LIMIT',id:CHAT,tabId:10,limitMode:mode,maxTurns:20})).ok,true);const after=(await s(h)).session;assert.equal(after.turns,1);assert.equal(after.generation,before.generation);assert.equal(after.lastClaim.token,before.lastClaim.token);assert.equal(after.enabled,true);}});
test('invalid per-chat limit changes fail without changing running state',async()=>{const h=harness();await activate(h);for(const n of [0,-1,1.5,'bad',Infinity])assert.equal((await h.rpc({type:'SET_LIMIT',id:CHAT,tabId:10,limitMode:'limited',maxTurns:n})).ok,false);assert.equal((await s(h)).session.enabled,true);});
test('long-running generation and tool activity never pause because text is unchanged',async()=>{for(const tool of [false,true]){const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('long operation');c.page.assistant('Waiting for tool',!tool);c.page.toolBusy=tool;await c.tick();h.updateClock(1800000);await c.tick();assert.equal((await s(h)).session.enabled,true);assert.equal((await s(h)).session.state,'GENERATING');assert.deepEqual(c.page.sent,[]);}});
test('tab visibility changes and opening another conversation do not reset owner counters',async()=>{const h=harness(),a=h.fakePage();await activate(h);await a.tick();a.page.user('start');a.page.assistant('Working',true);await a.tick();a.page.finish('Next pending');await a.tick();h.updateClock(7000);await a.tick();const before=(await s(h)).session;const otherId='bbbbbbbbbbbb-cccc-dddd-eeee-ffffffffffff',otherTab={id:12,url:'https://chatgpt.com/c/'+otherId};h.tabList.push(otherTab);const b=h.fakePage(otherTab,otherId);await new Promise(setImmediate);await b.tick();h.updateClock(10000);await a.tick();const after=(await s(h)).session;assert.equal(after.enabled,true);assert.equal(after.turns,1);assert.equal(after.generation,before.generation);assert.equal(after.lastClaim.token,before.lastClaim.token);});
test('settings migration adds Limited mode without resetting counters or overrides',async()=>{const h=harness();h.storage.settings={message:'continue',maxTurns:20};h.storage['chat:'+CHAT]={enabled:false,state:'PAUSED',turns:7,override:'my plan'};await h.events.installed({reason:'update'});const after=(await s(h)).session;assert.equal(after.limitMode,'limited');assert.equal(after.maxTurns,20);assert.equal(after.turns,7);assert.equal(after.override,'my plan');assert.equal((await s(h)).settings.schemaVersion,2);});
test('READY is a valid persisted transition before a single claim',async()=>{const h=harness();await activate(h);await h.rpc({type:'BASELINE',id:CHAT,snapshot:{assistantKey:'old'}},h.owner);assert.equal((await h.rpc({type:'PROGRESS',id:CHAT,state:'READY'},h.owner)).ok,true);assert.equal((await s(h)).session.state,'READY');assert.equal((await h.rpc({type:'CLAIM_SEND',id:CHAT,snapshot:{assistantKey:'new',assistantSig:'sig'}},h.owner)).ok,true);});

test('stale missing owner is reconciled to paused without ownership transfer',async()=>{const h=harness();await activate(h);h.tabList.splice(0,1);const st=(await s(h)).session;assert.equal(st.enabled,false);assert.match(st.lastError,/Owner tab unavailable/);assert.equal(st.ownerTabId,10);});

test('fallback placeholder IDs cannot claim a continuation before a durable message appears',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('next');c.page.assistant('Body may load later',true);await c.tick();c.page.finish('Next step remains');const a=c.page.entries.at(-1),original=a.getAttribute;a.getAttribute=k=>k==='data-message-id'?'fallback-turn-9':original(k);await c.tick();h.updateClock(15000);await c.tick();assert.deepEqual(c.page.sent,[]);a.getAttribute=original;await c.tick();h.updateClock(7000);await c.tick();assert.deepEqual(c.page.sent,['go']);});
test('header-only assistant placeholders are not completed reply content',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('next');c.page.assistant('ChatGPT said:',true);await c.tick();c.page.finish('ChatGPT said:');const a=c.page.entries.at(-1);a.querySelector=selector=>selector.includes('h4')?{textContent:'ChatGPT said:'}:null;await c.tick();h.updateClock(15000);await c.tick();assert.deepEqual(c.page.sent,[]);a.querySelector=selector=>selector.includes('assistant-message')?{textContent:'Actual reply; next step remains.'}:null;await c.tick();h.updateClock(7000);await c.tick();assert.deepEqual(c.page.sent,['go']);});
test('acknowledgment must match the submitted message, not an unrelated new user turn',async()=>{const h=harness(),c=h.fakePage();await activate(h);await c.tick();c.page.user('next');c.page.assistant('Working',true);await c.tick();c.page.finish('More remains');await c.tick();c.page.onSend=()=>{c.page.entries.at(-1).innerText='Different human message';};h.updateClock(7000);await c.tick();assert.deepEqual(c.page.sent,['go']);assert.equal((await s(h)).session.enabled,false);assert.match((await s(h)).session.lastError,/could not be verified/);});

async function missionHarness(){
 const h=harness(),remote={online:true,state:'ACTIVE',missions:new Map(),calls:[]};
 h.setFetch(async(url,options)=>{remote.calls.push(url);if(!remote.online)throw Error('Controlled outage');
  if(options.method==='POST'&&url.endsWith('/cancel')){const id=url.split('/').at(-2),body=remote.missions.get(id);if(remote.state==='ACTIVE')remote.state='CANCELLED';return {ok:true,json:async()=>({id,conversation_id:body.conversation_id,state:remote.state})};}
  if(options.method==='POST'){const body=JSON.parse(options.body);remote.missions.set(body.id,body);return {ok:true,json:async()=>({id:body.id,conversation_id:body.conversation_id,state:remote.state})};}
  const id=url.split('/').at(-1),body=remote.missions.get(id);return {ok:true,json:async()=>({id,conversation_id:body.conversation_id,state:remote.state})};
 });
 await h.rpc({type:'SET_MISSION_CONNECTION',enrollment:'fixture-enrollment-secret'});
 await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'mission'});
 return {h,remote};
}
async function deliverInstruction(h){const c=h.fakePage();await activate(h);await c.tick();h.updateClock(7000);await c.tick();assert.equal(c.page.sent.length,1);assert.match(c.page.sent[0],/Mission Signal instruction/);assert.equal((await s(h)).session.turns,0);return c;}
async function finishMissionReply(h,c,text='Next step remains'){c.page.assistant(text,true);await c.tick();c.page.finish(text);await c.tick();h.updateClock(7000);await c.tick();}

test('mission registers and confirms one instruction, without leaking secrets or counting it as a continuation',async()=>{
 const {h,remote}=await missionHarness();const c=await deliverInstruction(h);const st=await s(h);
 assert.equal(st.mission.instructionState,'sent');assert.match(c.page.sent[0],/mission-signal complete [a-f0-9-]+/);assert.equal(remote.missions.size,1);
 assert.ok(!JSON.stringify(st).includes('fixture-enrollment-secret'));assert.ok(!JSON.stringify(st).includes('readToken'));assert.ok(!c.page.sent[0].includes(h.storage['mission:'+CHAT].readToken));
 await finishMissionReply(h,c);assert.equal(c.page.sent.length,2);assert.equal((await s(h)).session.turns,1);
});
test('mission instruction ambiguity cannot be blindly retried after refresh or worker restart',async()=>{
 const {h}=await missionHarness(),c=h.fakePage();await activate(h);await c.tick();c.page.onSend=()=>{c.page.entries.at(-1).innerText='unrelated user text';};h.updateClock(7000);await c.tick();assert.equal((await s(h)).session.enabled,false);
 h.restart();const r=await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:true});assert.equal(r.ok,false);assert.match(r.error,/uncertain/);assert.equal(c.page.sent.length,1);
});
test('confirmed instruction is never resent when page refresh is explicitly resumed',async()=>{
 const {h}=await missionHarness();const first=await deliverInstruction(h);const refreshed=h.fakePage();await new Promise(setImmediate);await refreshed.tick();assert.equal((await s(h)).session.enabled,false);await activate(h);await refreshed.tick();h.updateClock(10000);await refreshed.tick();assert.deepEqual(refreshed.page.sent,[]);assert.equal(first.page.sent.length,1);
});
test('Unlimited remote outage permits exactly five additional attempts, then remains paused across restart',async()=>{
 const {h,remote}=await missionHarness();await h.rpc({type:'SET_LIMIT',id:CHAT,tabId:10,limitMode:'unlimited',maxTurns:2});const c=await deliverInstruction(h);remote.online=false;
 for(let i=1;i<=5;i++){await finishMissionReply(h,c);assert.equal((await s(h)).mission.offlineAttempts,i);assert.equal(c.page.sent.length,i+1);}
 assert.equal((await s(h)).session.enabled,false);h.restart();assert.equal((await s(h)).mission.offlineAttempts,5);assert.equal((await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:true})).ok,false);assert.equal(c.page.sent.length,6);
});
test('Limited never exceeds its cap during a remote outage',async()=>{
 const {h,remote}=await missionHarness();await h.rpc({type:'SET_LIMIT',id:CHAT,tabId:10,limitMode:'limited',maxTurns:2});const c=await deliverInstruction(h);remote.online=false;
 for(let i=0;i<3;i++)await finishMissionReply(h,c);
 assert.equal((await s(h)).session.enabled,false);assert.equal((await s(h)).session.turns,2);assert.equal((await s(h)).mission.offlineAttempts,2);assert.equal(c.page.sent.length,3);
});
test('reconnection synchronizes COMPLETED before any further continuation and affects only its conversation',async()=>{
 const {h,remote}=await missionHarness();const c=await deliverInstruction(h);remote.online=false;await finishMissionReply(h,c);assert.equal((await s(h)).mission.offlineAttempts,1);
 const otherId='bbbbbbbbbbbb-cccc-dddd-eeee-ffffffffffff';h.tabList.push({id:12,url:'https://chatgpt.com/c/'+otherId});await h.rpc({type:'SET_SESSION',id:otherId,tabId:12,enabled:true});
 remote.online=true;remote.state='COMPLETED';await finishMissionReply(h,c);assert.equal((await s(h)).session.state,'COMPLETED');assert.equal(c.page.sent.length,2);assert.equal((await h.rpc({type:'STATUS',id:otherId})).session.enabled,true);
});
test('Local Only ignores Mission Signal failure and mode switching requires Pause',async()=>{
 const {h,remote}=await missionHarness();await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'local'});remote.online=false;const c=h.fakePage();await activate(h);await c.tick();assert.equal((await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'mission'})).ok,false);c.page.user('next');await finishMissionReply(h,c);assert.deepEqual(c.page.sent,['go']);assert.equal((await s(h)).session.enabled,true);
});
test('mission mode does not equate intermediate prose with authoritative remote completion',async()=>{
 const {h}=await missionHarness();const c=await deliverInstruction(h);await finishMissionReply(h,c,'The task is complete. Another roadmap step remains.');assert.equal(c.page.sent.length,2);assert.equal((await s(h)).session.enabled,true);
});


test('same mission resume preserves Limited count, journal and offline grace across browser startup',async()=>{
 const {h,remote}=await missionHarness();await h.rpc({type:'SET_LIMIT',id:CHAT,tabId:10,limitMode:'limited',maxTurns:2});const c=await deliverInstruction(h);remote.online=false;await finishMissionReply(h,c);const before=await s(h);assert.equal(before.session.turns,1);assert.equal(before.mission.offlineAttempts,1);
 await h.events.startup();assert.equal((await s(h)).session.enabled,false);await activate(h);await c.tick();const after=await s(h);assert.equal(after.session.turns,1);assert.equal(after.session.lastClaim.token,before.session.lastClaim.token);assert.equal(after.mission.offlineAttempts,1);
 await finishMissionReply(h,c);assert.equal((await s(h)).session.turns,2);await finishMissionReply(h,c);assert.equal((await s(h)).session.enabled,false);assert.equal((await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:true})).ok,false);assert.equal(c.page.sent.length,3);
});
test('registration retry cannot inherit an unrelated prior Local Only count or journal',async()=>{
 const {h,remote}=await missionHarness();h.storage['chat:'+CHAT]={enabled:false,state:'PAUSED',turns:99,limitMode:'limited',maxTurns:2,lastClaim:{token:'unrelated-local-claim'}};
 remote.online=false;assert.equal((await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:true})).ok,false);const id=h.storage['mission:'+CHAT].id;
 remote.online=true;await activate(h);const after=await s(h);assert.equal(after.mission.id,id);assert.equal(after.session.missionId,id);assert.equal(after.session.turns,0);assert.equal(after.session.lastClaim,null);
});


test('cancel mission changes remote state and blocks old mission restart',async()=>{
 const {h,remote}=await missionHarness();await deliverInstruction(h);
 const result=await h.rpc({type:'CANCEL_MISSION',id:CHAT,tabId:10});
 assert.equal(result.ok,true);assert.equal(result.state,'CANCELLED');assert.equal(remote.state,'CANCELLED');
 assert.equal((await s(h)).session.enabled,false);
 const retry=await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:true});assert.equal(retry.ok,false);
 const newMission=await h.rpc({type:'NEW_MISSION',id:CHAT,tabId:10});assert.equal(newMission.ok,true);
 assert.equal((await s(h)).mission.id,null);
});

test('failed cancellation remains fail-closed without claiming success',async()=>{
 const {h,remote}=await missionHarness();await deliverInstruction(h);remote.online=false;
 const result=await h.rpc({type:'CANCEL_MISSION',id:CHAT,tabId:10});
 assert.equal(result.ok,false);assert.equal(remote.state,'ACTIVE');
 assert.equal((await s(h)).mission.state,'ACTIVE');
});

test('Mission Signal defaults unlimited and preserves Local Only cap on mode switch',async()=>{
 const {h}=await missionHarness();
 await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'local'});
 await h.rpc({type:'SET_LIMIT',id:CHAT,tabId:10,limitMode:'limited',maxTurns:20});
 await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'mission'});
 await h.rpc({type:'SET_MISSION_CAP',id:CHAT,tabId:10,enabled:false,maxTurns:20});
 await activate(h);let current=(await s(h)).session;assert.equal(current.limitMode,'unlimited');assert.equal(current.maxTurns,20);
 await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:false});
 assert.equal((await h.rpc({type:'CANCEL_MISSION',id:CHAT,tabId:10})).ok,true);
 assert.equal((await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'local'})).ok,true);
 await activate(h);current=(await s(h)).session;assert.equal(current.limitMode,'limited');assert.equal(current.maxTurns,20);
});


test('manually confirmed mission instruction is reconciled without repeating setup',async()=>{
 const {h}=await missionHarness(),c=h.fakePage();await activate(h);await c.tick();
 c.page.onSend=()=>{c.page.entries.at(-1).innerText='unrelated user text';};
 h.updateClock(7000);await c.tick();
 assert.equal((await s(h)).mission.instructionState,'claimed');
 assert.equal((await s(h)).session.enabled,false);
 c.page.entries.at(-1).innerText=c.page.sent[0];
 await c.tick();assert.equal((await s(h)).mission.instructionState,'sent');
 await activate(h);await c.tick();h.updateClock(12000);await c.tick();
 assert.equal(c.page.sent.length,1);
});


test('terminal mission history persists after reset and switching to Local Only',async()=>{
 const {h}=await missionHarness();await deliverInstruction(h);
 const finished=await h.rpc({type:'CANCEL_MISSION',id:CHAT,tabId:10});assert.equal(finished.state,'CANCELLED');
 const first=await s(h);assert.equal(first.missionHistory[0].state,'CANCELLED');
 const oldId=first.missionHistory[0].id;
 assert.equal((await h.rpc({type:'NEW_MISSION',id:CHAT,tabId:10})).ok,true);
 await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'local'});
 h.restart();const result=await s(h);
 assert.equal(result.missionHistory[0].id,oldId);assert.equal(result.missionHistory[0].state,'CANCELLED');
});

test('cannot switch from active registered Mission Signal to Local Only without cancellation',async()=>{
 const {h}=await missionHarness();await deliverInstruction(h);
 await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:false});
 const result=await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'local'});
 assert.equal(result.ok,false);assert.match(result.error,/Cancel the active mission/);
 assert.equal((await s(h)).mission.mode,'mission');
});


test('Local Only completion remains in activity history after starting a fresh session',async()=>{
 const h=harness();await activate(h);
 const done=await h.rpc({type:'PAUSE',id:CHAT,reason:'Roadmap completion detected.',state:'COMPLETED'},h.owner);
 assert.equal(done.ok,true);let result=await s(h);
 assert.equal(result.session.state,'COMPLETED');assert.equal(result.noticeHistory.length,1);
 assert.equal(result.noticeHistory[0].mode,'local');assert.equal(result.noticeHistory[0].state,'COMPLETED');
 assert.match(result.noticeHistory[0].reason,/Roadmap completion/);
 await activate(h);h.restart();result=await s(h);
 assert.equal(result.noticeHistory.length,1);assert.equal(result.noticeHistory[0].state,'COMPLETED');
});

test('important error notice survives refresh and activation without duplicate history',async()=>{
 const h=harness();await activate(h);
 await h.rpc({type:'PAUSE',id:CHAT,reason:'Submission uncertain: no acknowledgment.',state:'PAUSED'},h.owner);
 const before=await s(h);assert.equal(before.noticeHistory.length,1);
 await activate(h);h.restart();const after=await s(h);
 assert.equal(after.noticeHistory.length,1);assert.match(after.noticeHistory[0].reason,/Submission uncertain/);
});


test('optional Mission Signal cap cannot overwrite separate Local Only numeric preference',async()=>{
 const {h}=await missionHarness();
 assert.equal((await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'local'})).ok,true);
 await h.rpc({type:'SET_LIMIT',id:CHAT,tabId:10,limitMode:'limited',maxTurns:7});
 assert.equal((await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'mission'})).ok,true);
 await h.rpc({type:'SET_MISSION_CAP',id:CHAT,tabId:10,enabled:true,maxTurns:13});
 await activate(h);let current=(await s(h)).session;
 assert.equal(current.maxTurns,13);assert.equal(current.missionMaxTurns,13);assert.equal(current.localMaxTurns,7);
 await h.rpc({type:'SET_SESSION',id:CHAT,tabId:10,enabled:false});
 assert.equal((await h.rpc({type:'CANCEL_MISSION',id:CHAT,tabId:10})).ok,true);
 assert.equal((await h.rpc({type:'SET_MISSION_MODE',id:CHAT,tabId:10,mode:'local'})).ok,true);
 await activate(h);current=(await s(h)).session;
 assert.equal(current.limitMode,'limited');assert.equal(current.maxTurns,7);assert.equal(current.localMaxTurns,7);
 assert.equal(current.missionMaxTurns,13);
});
