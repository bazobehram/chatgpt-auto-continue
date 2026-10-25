// Isolated Chromium with the real unpacked extension and deterministic ChatGPT fixtures.
// Network requests to ChatGPT are intercepted; this suite never contacts the account.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),id='aaaaaaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',url=`https://chatgpt.com/c/${id}`;
(async()=>{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'autocontinue-qa-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',executablePath:process.env.QA_CHROMIUM||undefined,headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
let errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
await context.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'mock_chat.html'),'utf8')}));
try{
const page=await context.newPage();await page.goto(url);
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
const rpc=m=>worker.evaluate(async m=>{try{return await dispatch(m,{})}catch(e){return {ok:false,error:e.message}}},m);
const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,url);
const status=()=>rpc({type:'STATUS',id});
const wait=async(fn,timeout=20000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await page.waitForTimeout(100);}throw Error('Condition timed out');};
const start=async override=>{assert((await rpc({type:'SET_SESSION',id,tabId,enabled:true,override})).ok);await wait(async()=>(await status()).session.state!=='ARMING');};
const pause=()=>rpc({type:'SET_SESSION',id,tabId,enabled:false});
const complete=async()=>{await page.evaluate(()=>{mock.user('Harmless QA');mock.assistant('Working',true);});await page.waitForTimeout(400);await page.evaluate(()=>mock.finish('Next step pending.'));};
await rpc({type:'SET_SETTINGS',settings:{settleSeconds:3,maxTurns:2}});
await start('');await page.waitForTimeout(3400);assert.equal(await page.evaluate(()=>mock.sent.length),0);console.log('PASS activation baseline');
await page.evaluate(()=>{mock.user('QA');mock.assistant('Tool working',true);});await page.waitForTimeout(3500);assert.equal(await page.evaluate(()=>mock.sent.length),0);console.log('PASS active generation blocks sends');
await page.evaluate(()=>{mock.setRespond(['Next pending.','Next pending.']);mock.finish('First step ready.');});
await wait(async()=>await page.evaluate(()=>mock.sent.length)===2);await wait(async()=>(await status()).session.state==='PAUSED');assert.deepEqual(await page.evaluate(()=>mock.sent),['go','go']);await page.waitForTimeout(3500);assert.equal(await page.evaluate(()=>mock.sent.length),2);console.log('PASS consecutive replies, one attempt per reply, limit and no duplicates');
await start('custom QA');await complete();await wait(async()=>await page.evaluate(()=>mock.sent.length)===3);assert.equal((await page.evaluate(()=>mock.sent)).at(-1),'custom QA');await wait(async()=>(await status()).session.state!=='SENDING');await pause();console.log('PASS override and manual pause');
await start('');await page.reload();await wait(async()=>(await status()).session.enabled===false);assert.match((await status()).session.lastError,/refreshed/);console.log('PASS refresh pauses without reactivation');
await start('');const duplicate=await context.newPage();await duplicate.goto(url);const dupId=await worker.evaluate(async()=>{const ts=await chrome.tabs.query({});return ts.filter(t=>t.url?.includes('/c/aaaaaaaaaaaa')).at(-1).id;});assert.equal((await rpc({type:'SET_SESSION',id,tabId:dupId,enabled:true})).ok,false);await page.waitForTimeout(600);assert.equal((await status()).session.enabled,true);console.log('PASS duplicate-tab ownership and non-owner observation');
await duplicate.close();await pause();await start('');assert((await rpc({type:'REQUEST_KICKOFF',id,tabId})).ok);await wait(async()=>await page.evaluate(()=>mock.sent.length)===1);await pause();console.log('PASS manual first continuation');
await start('');await page.evaluate(()=>{const e=document.createElement('div');e.setAttribute('role','alert');e.textContent='Please confirm approval';document.body.append(e);});await wait(async()=>(await status()).session.enabled===false);console.log('PASS required approval pauses');
await page.evaluate(()=>document.querySelector('[role="alert"]').remove());await start('');await page.goto('https://chatgpt.com/');await wait(async()=>(await status()).session.enabled===false);console.log('PASS navigation pauses owner');
assert.deepEqual(errors,[]);console.log('PASS no page JavaScript errors');
}finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
