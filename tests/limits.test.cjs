// v0.5.0 limits, background work, overview controls and liveness acceptance.
// Network is intercepted and this isolated profile never contacts the live account.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'autocontinue-limits-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',executablePath:process.env.QA_CHROMIUM||undefined,headless:true,args:['--disable-extensions-except='+root,'--load-extension='+root]});
 const results=[],chats=[];let serial=0,control,popup,errors=[];
 const wait=async(fn,label,ms=25000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);};
 const check=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.stack});throw e;}};
 try{
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'mock_chat.html'),'utf8')}));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),extensionId=worker.url().split('/')[2],popupUrl='chrome-extension://'+extensionId+'/popup.html';
  control=await context.newPage();await control.goto(popupUrl);
  const rpc=m=>control.evaluate(m=>chrome.runtime.sendMessage(m),m),status=async c=>(await rpc({type:'STATUS',id:c.id})).session;
  const tick=c=>control.evaluate(tabId=>chrome.tabs.sendMessage(tabId,{type:'TICK'}),c.tabId);
  const newChat=async(title,existing)=>{
   const id=existing||'limits-qa-'+String(++serial).padStart(25,'0'),url='https://chatgpt.com/c/'+id,page=await context.newPage(),sent=[];
   await page.exposeFunction('recordQA',text=>sent.push(text));
   await page.addInitScript(()=>document.addEventListener('click',e=>{if(e.target.id==='send')void window.recordQA(document.querySelector('#prompt-textarea').value);},true));
   await page.goto(url);await page.evaluate(title=>document.title=title,title);
   const tabId=await control.evaluate(async url=>(await chrome.tabs.query({})).filter(t=>t.url===url).at(-1).id,url);
   const c={id,url,page,tabId,sent,title};chats.push(c);return c;
  };
  const start=async(c,override)=>{assert.equal((await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:true,override})).ok,true);await tick(c);await wait(async()=>(await status(c)).state!=='ARMING','baseline');};
  const pause=async c=>{assert.equal((await rpc({type:'SET_SESSION',id:c.id,tabId:c.tabId,enabled:false})).ok,true);await tick(c);await wait(async()=>(await status(c)).enabled===false,'pause');};
  const ack=async c=>wait(async()=>{const s=await status(c);return s.enabled&&s.lastClaim&&s.state!=='SENDING';},'durable acknowledgement');
  const complete=async(c,text='More steps remain.')=>{await c.page.evaluate(text=>{mock.user('QA');mock.assistant(text,true);},text);await tick(c);await c.page.evaluate(text=>mock.finish(text),text);await tick(c);};
  const openPopup=async c=>{
   const p=await context.newPage();await c.page.bringToFront();await p.goto(popupUrl);await p.setViewportSize({width:400,height:640});
   await wait(async()=>await p.locator('#conversation').textContent()===c.title,'correct title');return p;
  };
  await rpc({type:'SET_SETTINGS',settings:{message:'go',settleSeconds:3,maxTurns:2,limitMode:'limited',stallSeconds:60}});
  const a=await newChat('Disposable QA A'),b=await newChat('GX10 Yetki Doğrulaması');
  popup=await openPopup(a);
  await check('Main limit UI defaults Limited; no duplicate limit in Advanced; real title preserved',async()=>{
   assert.equal(await popup.locator('#limitMode').inputValue(),'limited');
   assert.equal(await popup.locator('#maxTurns').inputValue(),'2');
   assert.equal(await popup.locator('#settingsPanel #maxTurns').count(),0);
   assert.equal(await popup.locator('#settingsPanel').getAttribute('open'),null);
   assert.equal(await popup.locator('#limitProgress').textContent(),'0 / 2 continuations');
   const p=await openPopup(b);assert.equal(await p.locator('#conversation').textContent(),'GX10 Yetki Doğrulaması');await p.close();
  });
  await check('Background-tab send with custom message; popup is not the runtime owner',async()=>{
   await rpc({type:'SAVE_MESSAGE',id:a.id,tabId:a.tabId,override:'A message'});await start(a);
   await popup.close();popup=null;await b.page.bringToFront();await a.page.evaluate(()=>window.ackDelay=1800);
   await complete(a);await wait(()=>a.sent.length===1,'A background send');await ack(a);
   await a.page.evaluate(()=>window.ackDelay=0);assert.deepEqual(a.sent,['A message']);assert.equal((await status(a)).turns,1);assert.equal((await status(a)).enabled,true);
   popup=await openPopup(a);assert.equal(await popup.locator('#turns').textContent(),'1 / 2');
  });
  await check('Unlimited selection preserves count and journal, and exceeds Limited threshold',async()=>{
   const before=await status(a);await popup.locator('#limitMode').selectOption('unlimited');
   await wait(async()=>(await status(a)).limitMode==='unlimited','Unlimited saved');
   assert.equal((await status(a)).turns,1);assert.equal((await status(a)).generation,before.generation);assert.equal((await status(a)).lastClaim.token,before.lastClaim.token);
   for(let expected=2;expected<=4;expected++){await complete(a);await wait(()=>a.sent.length===expected,'Unlimited send '+expected);await ack(a);}
   await wait(async()=>(await popup.locator('#limitProgress').textContent()).includes('Unlimited ∞'),'Unlimited label');
   assert.equal((await status(a)).turns,4);assert.equal((await status(a)).enabled,true);
  });
  await check('Mode switching, tab switching and popup reopening preserve limits and counters',async()=>{
   // maxTurns is hidden in Unlimited; save its retained number through the API.
   await rpc({type:'SET_LIMIT',id:a.id,tabId:a.tabId,limitMode:'limited',maxTurns:20});
   await wait(async()=>await popup.locator('#limitMode').inputValue()==='limited','Limited UI');
   assert.equal((await status(a)).turns,4);assert.equal((await status(a)).enabled,true);
   await popup.locator('#limitMode').selectOption('unlimited');await wait(async()=>(await status(a)).limitMode==='unlimited','mode saved');
   const generation=(await status(a)).generation;await popup.close();popup=null;await b.page.bringToFront();await a.page.bringToFront();
   popup=await openPopup(a);assert.equal(await popup.locator('#limitMode').inputValue(),'unlimited');assert.equal((await status(a)).turns,4);assert.equal((await status(a)).generation,generation);
  });
  await check('Overview starts/pauses another conversation without focusing or resetting A',async()=>{
   await popup.locator('#tabsPanel summary').click();const row=popup.locator('[data-conversation-id="'+b.id+'"]');
   await wait(async()=>await row.count()===1,'B row');
   await row.getByRole('button',{name:'Start GX10 Yetki Doğrulaması',exact:true}).click();
   await wait(async()=>(await status(b))?.enabled===true,'B started from overview');assert.equal((await status(a)).turns,4);assert.equal((await status(a)).enabled,true);
   await complete(b);await wait(()=>b.sent.length===1,'B independent default send');await ack(b);
   assert.deepEqual(b.sent,['go']);assert.equal((await status(b)).turns,1);assert.equal((await status(a)).turns,4);
   const duplicate=await newChat('GX10 duplicate fixture',b.id);
   await wait(async()=>(await row.locator('.small').textContent()).includes('2 tabs'),'duplicate grouping');assert.equal(await popup.locator('[data-conversation-id="'+b.id+'"]').count(),1);assert.deepEqual(duplicate.sent,[]);
   await row.getByRole('button',{name:'Pause GX10 Yetki Doğrulaması',exact:true}).click();await wait(async()=>(await status(b)).enabled===false,'B paused');
   assert.equal((await status(a)).enabled,true);assert.equal((await status(a)).turns,4);await duplicate.page.close();
  });
  await check('Long-running background tool remains active beyond stall timeout without stale warning',async()=>{
   await a.page.evaluate(()=>{mock.setBusy(false);const e=document.createElement('div');e.id='qa-tool';e.dataset.testid='thinking-indicator';e.textContent='Tool is still working';document.body.append(e);});
   await tick(a);await b.page.bringToFront();await a.page.waitForTimeout(65000);await tick(a);
   const s=await status(a);assert.equal(s.enabled,true);assert.equal(s.state,'GENERATING');assert.equal(s.lastError,'');assert.equal(a.sent.length,4);
   await pause(a);await a.page.evaluate(()=>document.querySelector('#qa-tool').remove());
  });
  await check('Unlimited never bypasses approval, roadmap completion or usage-limit stops',async()=>{
   for(const [text,state] of [['Please approve before proceeding.','NEEDS_USER'],['The roadmap is fully complete.','COMPLETED'],["You have reached your limit. Try again later.",'PAUSED']]){
    const c=await newChat('Unlimited safety');
    await rpc({type:'SET_LIMIT',id:c.id,tabId:c.tabId,limitMode:'unlimited',maxTurns:2});await start(c);
    await complete(c,text);await wait(async()=>(await status(c)).enabled===false,'Unlimited safety stop');assert.equal((await status(c)).state,state);assert.deepEqual(c.sent,[]);await c.page.close();
   }
  });
  await check('Operational status never reports Running for a paused/unreachable controller',async()=>{
   const c=await newChat('Frozen QA controller');await start(c);const cdp=await context.newCDPSession(c.page);
   await b.page.bringToFront();await cdp.send('Debugger.enable');await cdp.send('Debugger.pause');
   const row=popup.locator('[data-conversation-id="'+c.id+'"]');await wait(async()=>await row.count()===1,'frozen row');
   await wait(async()=>await row.locator('.tab-state').textContent()==='Needs attention','honest liveness status');
   assert.equal((await status(c)).enabled,true);await row.getByRole('button',{name:'Pause Frozen QA controller',exact:true}).click();await wait(async()=>(await status(c)).enabled===false,'unreachable controller paused from overview');
   await cdp.send('Debugger.resume');await tick(c);await pause(c);await cdp.detach();await c.page.close();
  });
  await check('Detached failed-response renderer pauses only its matching latest message',async()=>{
   const c=await newChat('Detached renderer error');
   await c.page.evaluate(()=>{const box=document.createElement('div');box.dataset.dilMessageId='old-unrelated-message';box.innerHTML='<div role="status" data-dil-render-failed>This response couldn’t load</div>';document.body.append(box);});
   await start(c);await tick(c);assert.equal((await status(c)).enabled,true,'historical renderer error must not leak');
   await c.page.evaluate(()=>{const latest=[...document.querySelectorAll('[data-message-author-role="assistant"]')].at(-1);const box=document.createElement('div');box.dataset.dilMessageId=latest.dataset.messageId;box.innerHTML='<div role="status" data-dil-render-failed>This response couldn’t load</div>';document.body.append(box);});
   await tick(c);await wait(async()=>(await status(c)).enabled===false,'latest render failure pause');assert.match((await status(c)).lastError,/could not load the latest response/);assert.deepEqual(c.sent,[]);await c.page.close();
  });
  await check('Limited lowering stops safely without resetting attempts; no QA session remains armed',async()=>{
   const c=await newChat('Limited cap');await start(c);await complete(c);await wait(()=>c.sent.length===1,'limited first send');await ack(c);
   await rpc({type:'SET_LIMIT',id:c.id,tabId:c.tabId,limitMode:'limited',maxTurns:1});assert.equal((await status(c)).enabled,false);assert.equal((await status(c)).turns,1);
   await c.page.close();await popup.close();popup=null;await a.page.close();await b.page.close();
   for(const c of chats)assert.equal((await status(c)).enabled,false,c.id+' still armed');assert.deepEqual(errors,[]);
  });
 }finally{
  if(control&&!control.isClosed())await control.evaluate(async()=>{const all=await chrome.storage.local.get(null);for(const [k,v] of Object.entries(all))if(k.startsWith('chat:'))await chrome.storage.local.set({[k]:{...v,enabled:false,state:'PAUSED',lastError:'Isolated QA cleanup'}});}).catch(()=>{});
  await context.close();fs.rmSync(profile,{recursive:true,force:true});
  fs.writeFileSync(path.join(__dirname,'limits-results.json'),JSON.stringify({date:new Date().toISOString(),version:'0.5.0',environment:'isolated real Chromium with local fixtures',results},null,2));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
