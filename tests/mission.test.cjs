// Real unpacked MV3 extension; all web traffic is fulfilled locally.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'autocontinue-mission-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',executablePath:process.env.QA_CHROMIUM||undefined,headless:true,args:['--disable-extensions-except='+root,'--load-extension='+root]});
 const results=[],chats=[],missions=new Map();let control,online=true,serial=0,requests=0;
 const wait=async(fn,label,ms=25000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);};
 const check=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.stack});throw e;}};
 try{
  await context.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'mock_chat.html'),'utf8')}));
  await context.route('https://mission-signal.synovaq.org/**',async route=>{
   requests++;if(!online)return route.abort('connectionfailed');const req=route.request();let result;
   if(req.method()==='POST'&&req.url().endsWith('/cancel')){
     const id=req.url().split('/').at(-2),current=missions.get(id);
     if(current?.state==='ACTIVE')current.state='CANCELLED';
     result=current;
   }else if(req.method()==='POST'){
     const body=req.postDataJSON();result={id:body.id,conversation_id:body.conversation_id,state:'ACTIVE'};missions.set(body.id,result);
   }else result=missions.get(req.url().split('/').at(-1));
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),extensionId=worker.url().split('/')[2],popupUrl='chrome-extension://'+extensionId+'/popup.html';
  control=await context.newPage();await control.goto(popupUrl);
  const rpc=m=>control.evaluate(m=>chrome.runtime.sendMessage(m),m),status=c=>rpc({type:'STATUS',id:c.id});
  const tick=c=>control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'TICK'}),c.tabId);
  const newChat=async(mode='mission')=>{
   const id='mission-qa-'+String(++serial).padStart(22,'0'),url='https://chatgpt.com/c/'+id,page=await context.newPage();await page.goto(url);
   const tabId=await control.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,url),c={id,url,page,tabId};chats.push(c);
   assert.equal((await rpc({type:'SET_MISSION_MODE',id,tabId,mode})).ok,true);return c;
  };
  const sent=c=>c.page.evaluate(()=>mock.sent);
  const start=async c=>{assert.equal((await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:true})).ok,true);await tick(c);};
  const reply=async(c,text='Next work remains.')=>{await c.page.evaluate(text=>{mock.setBusy(false);mock.assistant(text,false);},text);await tick(c);};
  const instruction=async c=>{await start(c);await wait(async()=>(await sent(c)).length===1,'one instruction');await wait(async()=>(await status(c)).mission.instructionState==='sent','acknowledged instruction');};
  await rpc({type:'SET_SETTINGS',settings:{settleSeconds:3,maxTurns:20}});await rpc({type:'SET_MISSION_CONNECTION',enrollment:'fixture-secret-only'});
  const a=await newChat();
  await check('Registration and one automatically acknowledged instruction; no secrets in chat',async()=>{
   await instruction(a);const text=(await sent(a))[0],s=await status(a);assert.match(text,/mission-signal complete/);assert.ok(!text.includes('fixture-secret-only'));assert.equal(s.session.turns,0);assert.equal(missions.size,1);
  });
  await check('Refresh and explicit resume never repeat a confirmed instruction',async()=>{
   await a.page.reload();await tick(a);await wait(async()=>(await status(a)).session.enabled===false,'refresh paused');await start(a);await a.page.waitForTimeout(3500);assert.deepEqual(await sent(a),[]);assert.equal((await status(a)).mission.instructionState,'sent');
  });
  await check('Unlimited outage: persisted Disconnected X/5 UI, five attempts only, then pause',async()=>{
   await rpc({type:'SET_LIMIT',id:a.id,tabId:a.tabId,limitMode:'unlimited',maxTurns:2});online=false;
   await a.page.evaluate(()=>mock.user('new QA work'));
   for(let i=1;i<=5;i++){
    await reply(a);await wait(async()=>(await sent(a)).length===i,'offline send'+i);await wait(async()=>(await status(a)).mission.offlineAttempts===i,'offline count'+i);
    if(i===2){
     const popup=await context.newPage();await a.page.bringToFront();await popup.goto(popupUrl);await wait(async()=>(await popup.locator('#missionStatus').textContent()).includes('Disconnected · 2/5'),'honest recovery UI');assert.equal(await popup.locator('#status').textContent(),'Recovery');await popup.close();
     const before=await status(a),cdp=await context.newCDPSession(a.page),versions=[];
     cdp.on('ServiceWorker.workerVersionUpdated',e=>versions.push(...e.versions));await cdp.send('ServiceWorker.enable');
     await wait(()=>versions.some(v=>v.scriptURL==='chrome-extension://'+extensionId+'/background.js'&&v.runningStatus==='running'),'mission worker running');
     const v=versions.findLast(v=>v.scriptURL==='chrome-extension://'+extensionId+'/background.js'&&v.runningStatus==='running');
     await cdp.send('ServiceWorker.stopWorker',{versionId:v.versionId});await wait(()=>versions.some(x=>x.versionId===v.versionId&&x.runningStatus==='stopped'),'mission worker stopped');
     const after=await status(a);assert.equal(after.mission.offlineAttempts,2);assert.equal(after.mission.id,before.mission.id);assert.equal(after.mission.instructionState,'sent');assert.equal(after.session.turns,2);await cdp.detach();
    }
   }
   await wait(async()=>(await status(a)).session.enabled===false,'five attempt pause');assert.equal((await status(a)).session.turns,5);assert.equal((await status(a)).mission.offlineAttempts,5);
   await a.page.reload();await tick(a);assert.equal((await rpc({type:'SET_SESSION',id:a.id,tabId:a.tabId,enabled:true})).ok,false);assert.equal((await status(a)).mission.offlineAttempts,5);
  });
  await check('Explicit Local Only continues independently throughout the remote outage',async()=>{
   const c=await newChat('local');await start(c);await c.page.evaluate(()=>mock.user('local QA'));await reply(c);await wait(async()=>(await sent(c)).length===1,'Local Only offline continuation');assert.equal((await status(c)).session.enabled,true);await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:false});
  });
  await check('Reconnection synchronizes remote completion and never sends another go',async()=>{
   const m=(await status(a)).mission;missions.get(m.id).state='COMPLETED';online=true;const r=await rpc({type:'SET_SESSION',id:a.id,tabId:a.tabId,enabled:true});assert.equal(r.ok,false);assert.equal((await status(a)).session.state,'COMPLETED');assert.deepEqual(await sent(a),[]);
  });
  await check('Same mission resume preserves Limited count and journal rather than granting a fresh allowance',async()=>{
   const c=await newChat();await rpc({type:'SET_LIMIT',id:c.id,tabId:c.tabId,limitMode:'limited',maxTurns:1});await instruction(c);
   await reply(c);await wait(async()=>(await sent(c)).length===2,'one counted continuation');await wait(async()=>(await status(c)).session.state!=='SENDING','continuation ack');
   await reply(c);await wait(async()=>(await status(c)).session.enabled===false,'mission cap pause');const before=await status(c);
   assert.equal((await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:true})).ok,false);assert.equal((await status(c)).session.turns,1);
   await rpc({type:'SET_LIMIT',id:c.id,tabId:c.tabId,limitMode:'limited',maxTurns:2});await start(c);const after=await status(c);assert.equal(after.session.turns,1);assert.equal(after.session.lastClaim.token,before.session.lastClaim.token);assert.equal(after.mission.id,before.mission.id);await c.page.waitForTimeout(3500);assert.equal((await sent(c)).length,2);await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:false});
  });
  await check('Remote completion stops only the matching conversation, including during generation',async()=>{
   const b=await newChat(),c=await newChat('local');await instruction(b);await start(c);await b.page.evaluate(()=>mock.setBusy(true));
   const id=(await status(b)).mission.id;missions.get(id).state='COMPLETED';await rpc({type:'MISSION_SYNC',id:b.id,force:true,generation:(await status(b)).session.generation}).then(async r=>{if(!r.ok)await control.evaluate(async t=>chrome.tabs.sendMessage(t,{type:'TICK'}),b.tabId);});
   // Force an owner-originated synchronization through a normal controller cycle after the cache expires.
   await b.page.waitForTimeout(15100);await tick(b);assert.equal((await status(b)).session.state,'COMPLETED');assert.equal((await status(c)).session.enabled,true);await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:false});
  });
  await check('Completed mission UI disables Start and retains evidence after New Mission and Local Only',async()=>{
   await a.page.bringToFront();const popup=await context.newPage();popup.on('dialog',dialog=>dialog.accept());await a.page.bringToFront();await popup.goto(popupUrl);
   await wait(async()=>await popup.locator('#status').textContent()==='Completed','completed badge');
   assert.equal(await popup.locator('#toggleSession').isDisabled(),true);
   assert.match(await popup.locator('#missionStatus').textContent(),/mission completed/);
   const old=(await status(a)).mission.id;
   await popup.locator('#newMission').click();
   await wait(async()=>!(await status(a)).mission.id,'fresh mission prepared');
   await wait(async()=>await popup.locator('#missionHistoryItems').textContent().then(t=>t.includes(old)),'completed history retained');
   await popup.locator('#missionMode').selectOption('local');
   await wait(async()=>await popup.locator('#missionMode').inputValue()==='local','Local Only selected');
   assert.match(await popup.locator('#missionHistoryItems').textContent(),/COMPLETED/);
   await popup.close();
  });
  await check('Cancel mission changes remote state, preserves history, and blocks abandoned mode switch',async()=>{
   const c=await newChat();await instruction(c);
   const denied=await rpc({type:'SET_MISSION_MODE',id:c.id,tabId:c.tabId,mode:'local'});assert.equal(denied.ok,false);
   const previous=(await status(c)).mission.id;
   const cancelled=await rpc({type:'CANCEL_MISSION',id:c.id,tabId:c.tabId});assert.equal(cancelled.ok,true);assert.equal(cancelled.state,'CANCELLED');assert.equal(missions.get(previous).state,'CANCELLED');
   assert.equal((await status(c)).session.enabled,false);
   assert.equal((await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:true})).ok,false);
   assert.equal((await rpc({type:'NEW_MISSION',id:c.id,tabId:c.tabId})).ok,true);
   assert.equal((await status(c)).missionHistory[0].id,previous);
   assert.equal((await status(c)).missionHistory[0].state,'CANCELLED');
  });
  await check('Cleanup leaves no armed disposable controllers; connection checks occurred before sends',async()=>{
   for(const c of chats){await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:false});await c.page.close();assert.equal((await status(c)).session.enabled,false);}assert.ok(requests>15);
  });
 }finally{if(control&&!control.isClosed())await control.evaluate(async()=>{const all=await chrome.storage.local.get(null);for(const [k,v]of Object.entries(all))if(k.startsWith('chat:'))await chrome.storage.local.set({[k]:{...v,enabled:false,state:'PAUSED'}});}).catch(()=>{});await context.close();fs.rmSync(profile,{recursive:true,force:true});fs.writeFileSync(path.join(__dirname,'mission-results.json'),JSON.stringify({version:'0.6.0',environment:'isolated Chromium fixtures',results},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
