// Disposable Chromium profile only. All ChatGPT traffic is fulfilled with local fixtures.
// Uses the real MV3 runtime listener, persistent storage, content script, and popup.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'auto-continue-acceptance-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',executablePath:process.env.QA_CHROMIUM||undefined,headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
 const results=[],errors=[],chats=[];
 let control,worker,extensionId,serial=0;
 const check=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.stack});console.error('FAIL '+name+' '+e.message);throw e;}};
 const wait=async(fn,label,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);};
 try{
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'mock_chat.html'),'utf8')}));
  worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');extensionId=worker.url().split('/')[2];
  control=await context.newPage();await control.goto(`chrome-extension://${extensionId}/popup.html`);
  const rpc=m=>control.evaluate(m=>chrome.runtime.sendMessage(m),m);
  const status=async c=>(await rpc({type:'STATUS',id:c.id})).session;
  const tick=c=>control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'TICK'}),c.tabId);
  const start=async(c,override='go')=>{const r=await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:true,override});assert.equal(r.ok,true,r.error);await tick(c);await wait(async()=>(await status(c)).state!=='ARMING','baseline');};
  const pause=async c=>{assert.equal((await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:false})).ok,true);await tick(c);assert.equal((await status(c)).enabled,false);};
  const newChat=async(existingId)=>{const id=existingId||`acceptance-${String(++serial).padStart(25,'0')}`,url=`https://chatgpt.com/c/${id}`,page=await context.newPage(),sent=[];
   await page.exposeFunction('qaRecord',text=>sent.push(text));
   await page.addInitScript(()=>document.addEventListener('click',e=>{if(e.target.id==='send')void window.qaRecord(document.getElementById('prompt-textarea').value);},true));
   await page.goto(url);await page.evaluate(()=>document.title='Disposable QA '+location.pathname.split('/').at(-1));
   const tabId=await control.evaluate(async url=>(await chrome.tabs.query({})).filter(t=>t.url===url).at(-1).id,url);
   const c={id,url,page,tabId,sent};chats.push(c);return c;};
  const working=async c=>{await c.page.evaluate(()=>{mock.user('QA prompt');mock.assistant('Tool or generation in progress',true);});await tick(c);};
  const finish=async c=>{await c.page.evaluate(()=>mock.finish('Milestone ready; next step pending.'));await tick(c);};
  const confirmed=async c=>wait(async()=>(await status(c)).enabled&&(await status(c)).state!=='SENDING'&&(await status(c)).lastClaim,'submission confirmation');
  await rpc({type:'SET_SETTINGS',settings:{settleSeconds:3,maxTurns:5,stallSeconds:180,autoReload:false}});
  await check('1 Duplicate-tab ownership: one sender',async()=>{
   const a=await newChat(),b=await newChat(a.id);await start(a,'owner only');
   const r=await rpc({type:'SET_SESSION',id:a.id,tabId:b.tabId,enabled:true});assert.equal(r.ok,false);assert.match(r.error,/another tab/);
   const duplicatePopup=await context.newPage();await b.page.bringToFront();await duplicatePopup.goto(`chrome-extension://${extensionId}/popup.html`);
   await wait(async()=>await duplicatePopup.locator('#status').textContent()==='Other tab','duplicate popup status');
   assert.equal(await duplicatePopup.locator('#activity').textContent(),'Running in another tab. This tab cannot send.');
   assert.equal(await duplicatePopup.locator('#toggleSession').isEnabled(),false);assert.equal(await duplicatePopup.locator('#kickoff').isEnabled(),false);assert.equal(await duplicatePopup.locator('#restore').isEnabled(),false);await duplicatePopup.close();
   await working(a);await working(b);await finish(a);await finish(b);
   await wait(()=>a.sent.length===1,'owner send');await confirmed(a);await b.page.waitForTimeout(3500);
   assert.deepEqual(a.sent,['owner only']);assert.deepEqual(b.sent,[]);assert.equal((await status(a)).ownerTabId,a.tabId);
   await pause(a);await working(a);await finish(a);await a.page.waitForTimeout(3500);assert.equal(a.sent.length,1);await b.page.close();await a.page.close();
  });
  await check('2 Different conversations: independent messages, counters, journals and pause',async()=>{
   const a=await newChat(),b=await newChat();await start(a,'message A');await start(b,'message B');
   await working(a);await working(b);await finish(a);await finish(b);
   await wait(()=>a.sent.length===1&&b.sent.length===1,'independent sends');await confirmed(a);await confirmed(b);
   assert.deepEqual(a.sent,['message A']);assert.deepEqual(b.sent,['message B']);const sa=await status(a),sb=await status(b);assert.equal(sa.turns,1);assert.equal(sb.turns,1);assert.notEqual(sa.lastClaim.token,sb.lastClaim.token);
   await pause(a);await working(a);await finish(a);await working(b);await finish(b);await wait(()=>b.sent.length===2,'B keeps running');await confirmed(b);
   assert.equal(a.sent.length,1);assert.equal((await status(a)).enabled,false);assert.equal((await status(b)).enabled,true);assert.equal((await status(b)).turns,2);await pause(b);await a.page.close();await b.page.close();
  });
  await check('3 Refresh during generation: disarmed without continuation',async()=>{
   const a=await newChat();await start(a);await working(a);assert.equal((await status(a)).state,'GENERATING');await a.page.reload();await tick(a);
   await wait(async()=>(await status(a)).enabled===false,'refresh pause');assert.match((await status(a)).lastError,/refreshed/);
   await working(a);await finish(a);await a.page.waitForTimeout(3500);assert.deepEqual(a.sent,[]);await a.page.close();
  });
  await check('4 Refresh after completed response: prior continuation not replayed',async()=>{
   const a=await newChat();await start(a);await working(a);await finish(a);await wait(()=>a.sent.length===1,'first send');await confirmed(a);
   const claim=(await status(a)).lastClaim;await a.page.reload();await tick(a);await wait(async()=>(await status(a)).enabled===false,'pause after refresh');
   assert.equal((await status(a)).lastClaim.token,claim.token);assert.equal((await status(a)).turns,1);
   await working(a);await finish(a);await a.page.waitForTimeout(3500);assert.deepEqual(a.sent,['go']);await a.page.close();
  });
  await check('5 Owner closure and reopening: paused, settings and journal restored',async()=>{
   const a=await newChat();await start(a,'persist me');await working(a);await finish(a);await wait(()=>a.sent.length===1,'record journal');await confirmed(a);const before=await status(a);
   await a.page.close();await wait(async()=>(await status(a)).enabled===false,'owner close');assert.match((await status(a)).lastError,/closed/);
   const reopened=await newChat(a.id);await tick(reopened);const after=await status(a);assert.equal(after.enabled,false);assert.equal(after.override,'persist me');assert.equal(after.turns,1);assert.equal(after.lastClaim.token,before.lastClaim.token);
   await working(reopened);await finish(reopened);await reopened.page.waitForTimeout(3500);assert.deepEqual(reopened.sent,[]);await reopened.page.close();
  });
  await check('6 Real service-worker stop/restart: persisted journal and no replay',async()=>{
   const a=await newChat();await start(a);await working(a);await finish(a);await wait(()=>a.sent.length===1,'send before worker stop');await confirmed(a);const before=await status(a);
   const cdp=await context.newCDPSession(a.page);let versions=[];cdp.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await cdp.send('ServiceWorker.enable');
   await wait(()=>versions.some(v=>v.scriptURL===`chrome-extension://${extensionId}/background.js`&&v.runningStatus==='running'),'worker version');
   const v=versions.filter(v=>v.scriptURL===`chrome-extension://${extensionId}/background.js`&&v.runningStatus==='running').at(-1);
   await cdp.send('ServiceWorker.stopWorker',{versionId:v.versionId});await wait(()=>versions.some(x=>x.versionId===v.versionId&&x.runningStatus==='stopped'),'protocol confirms worker stopped');
   // Real runtime messaging wakes the worker; no page or extension reload is used.
   const after=await status(a);assert.equal(after.turns,1);assert.equal(after.lastClaim.token,before.lastClaim.token);assert.equal(after.enabled,true);
   await wait(()=>versions.slice(versions.findIndex(x=>x.versionId===v.versionId&&x.runningStatus==='stopped')+1).some(x=>x.scriptURL===`chrome-extension://${extensionId}/background.js`&&x.runningStatus==='running'),'protocol confirms worker restarted');
   await tick(a);await a.page.waitForTimeout(3500);assert.deepEqual(a.sent,['go']);
   await working(a);await finish(a);await wait(()=>a.sent.length===2,'next new reply after worker restart');await confirmed(a);assert.equal((await status(a)).turns,2);await pause(a);await cdp.detach();await a.page.close();
  });
  await check('7 Actual popup: correct conversation and live generating/paused/counter state',async()=>{
   const a=await newChat(),popup=await context.newPage();await a.page.bringToFront();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
   await wait(async()=>await popup.locator('#conversation').textContent()==='Disposable QA '+a.id,'popup conversation');
   await popup.getByRole('button',{name:'Start',exact:true}).click();await wait(async()=>(await status(a)).state==='OBSERVING','popup Start');
   await working(a);await wait(async()=>await popup.locator('#status').textContent()==='Generating','live generating badge');
   await popup.getByRole('button',{name:'Pause',exact:true}).click();await wait(async()=>(await status(a)).enabled===false,'popup Pause');
   assert.equal(await popup.locator('#toggleSession').textContent(),'Start');assert.equal(await popup.locator('#turns').textContent(),'0 / 5');
   await finish(a);await a.page.waitForTimeout(3500);assert.deepEqual(a.sent,[]);assert.equal(await popup.locator('#status').textContent(),'Paused');
   await popup.close();await a.page.close();
  });
  await check('Cleanup: no armed disposable sessions, no remaining QA tabs, no page errors',async()=>{
   // Close events are awaited through storage checks; counters are not used as proof of safety.
   for(const c of chats){const s=await status(c);assert.equal(s.enabled,false,`still armed: ${c.id}`);assert.notEqual(s.state,'SENDING');}
   const open=await control.evaluate(()=>chrome.tabs.query({url:'https://chatgpt.com/*'}));assert.deepEqual(open,[]);assert.deepEqual(errors,[]);
  });
 }finally{
  // Last-resort cleanup applies only to this isolated profile, even on a failed assertion.
  if(control&&!control.isClosed())await control.evaluate(async()=>{const all=await chrome.storage.local.get(null);for(const [k,v] of Object.entries(all))if(k.startsWith('chat:'))await chrome.storage.local.set({[k]:{...v,enabled:false,state:'PAUSED',lastError:'Isolated QA cleanup'}});}).catch(()=>{});
  await context.close();fs.rmSync(profile,{recursive:true,force:true});
  fs.writeFileSync(path.join(__dirname,'acceptance-results.json'),JSON.stringify({date:new Date().toISOString(),environment:'isolated Chromium; intercepted ChatGPT fixtures; real MV3 runtime',results},null,2));
 }
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
