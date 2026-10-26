'use strict';
(() => {
  if(window.__autoContinueController)return;
  window.__autoContinueController=true;
  let stopped=false,scheduled=null,timer=null,observer=null;
  function shutdown(){
    if(stopped)return;
    stopped=true;
    if(timer!==null)clearInterval(timer);
    if(scheduled!==null)clearTimeout(scheduled);
    observer?.disconnect();
    if(window.__autoContinueController)window.__autoContinueController=false;
  }
  const invalidContext=e=>/Extension context invalidated|context invalidated|Extension has been reloaded/i.test(String(e?.message||e));
  const documentId=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const CHAT_RE=/^(?:\/g\/[^/]+)?\/c\/([\w-]{10,})\/?$/;
  const MESSAGE_SEL='[data-message-author-role="assistant"], [data-message-author-role="user"], [data-chatgpt-search-unit-key$=":assistant"], [data-chatgpt-search-unit-key$=":user"]';
  const role=e=>e.getAttribute('data-message-author-role')||(e.getAttribute('data-chatgpt-search-unit-key')||'').split(':').at(-1);
  let sessionGeneration=null;
  const send=async msg=>{
    if(stopped)throw Error('Controller stopped');
    try{return await chrome.runtime.sendMessage({...msg,generation:sessionGeneration});}
    catch(e){if(invalidContext(e))shutdown();throw e;}
  };
  const now=()=>Date.now();
  const getId=()=>location.pathname.match(CHAT_RE)?.[1]||null;
  const hash=text=>{let v=2166136261;for(let i=0;i<text.length;i++)v=Math.imul(v^text.charCodeAt(i),16777619);return (v>>>0).toString(16);};
  let activeId=null, running=false, lastSig=null, changedAt=now(), sawBusy=false, lastProgressSig='',lastProgressAt=now(),lastState='',lastReplyKey=null;
  let lastUserCount=0, lastUserKey=null, observedNewUser=false, lastGenerationObserved=false, activationGeneration=null;
  function snapshot(){
    const nodes=[...document.querySelectorAll(MESSAGE_SEL)].filter(e=>role(e)==='assistant'||role(e)==='user');
    const assistants=nodes.filter(e=>role(e)==='assistant');
    const users=nodes.filter(e=>role(e)==='user');
    const assistant=assistants.at(-1),user=users.at(-1);
    const identity=e=>{
      if(!e)return null;
      const ids=[e.getAttribute('data-message-id'),e.getAttribute('data-chatgpt-search-message-ids')?.split(' ')[0],e.querySelector?.('[data-chatgpt-selection-message-id]')?.getAttribute('data-chatgpt-selection-message-id')];
      return ids.find(id=>typeof id==='string'&&id&&!/^(fallback-|pending-|local-)/i.test(id))||null;
    };
    const assistantKey=identity(assistant,assistants.length), userKey=identity(user,users.length);
    const renderFailed=Boolean(assistantKey&&[...document.querySelectorAll('[data-dil-render-failed]')].some(e=>e.getClientRects().length>0&&e.closest('[data-dil-message-id]')?.getAttribute('data-dil-message-id')===assistantKey));
    const body=assistant?.querySelector?.('[data-markdown-text-style="assistant-message"]');
    let assistantText=(body?.textContent||body?.innerText||assistant?.innerText||assistant?.textContent||'').trim();
    if(!body){const heading=assistant?.querySelector?.('h4[data-conversation-role="assistant"], h4');const label=(heading?.textContent||heading?.innerText||'').trim();if(label&&assistantText.startsWith(label))assistantText=assistantText.slice(label.length).trim();}
    const assistantSig=assistantText?`${assistantKey}:${assistantText.length}:${hash(assistantText)}`:null;
    const lastRole=nodes.length?role(nodes.at(-1)):null;
    const buttons=[...document.querySelectorAll('button')];
    const label=b=>[b.getAttribute('data-testid'),b.getAttribute('aria-label'),b.getAttribute('title')].filter(Boolean).join(' ').toLowerCase();
    const stop=buttons.some(b=>/^stop$|\bstop[-_ ]?(generating|response|streaming)\b|\bstop-button\b/.test(label(b))&&!b.disabled&&!b.hidden&&b.getClientRects().length>0);
    const streaming=!!document.querySelector('[data-is-streaming="true"], [data-testid="loading-indicator"], [data-testid="thinking-indicator"], [aria-label="Conversation"] [aria-busy="true"]');
    const editor=document.querySelector('#prompt-textarea[contenteditable="true"], div[contenteditable="true"][data-testid="composer-text-input"], textarea#prompt-textarea, [contenteditable="true"][role="textbox"][aria-label="Ask ChatGPT"]');
    const editorText=editor?(editor.isContentEditable?editor.innerText:editor.value||'').trim():'';
    const submit=buttons.find(b=>b.getAttribute('data-testid')==='send-button'||/^(send|send prompt|send message)$/i.test(b.getAttribute('aria-label')||''));
    const turn=assistant?.closest('[data-talvt-turn-state]');
    const finalEvidence=turn?turn.getAttribute('data-talvt-turn-state')==='complete':Boolean(assistant?.getAttribute('data-complete')==='true'||assistant?.closest('[data-testid^="conversation-turn-"]')?.querySelector?.('[data-testid="copy-turn-action-button"], button[aria-label="Copy"], button[aria-label="Copy response"]'));
    const busy=stop||streaming||Boolean(turn&&turn.getAttribute('data-talvt-turn-state')!=='complete');
    return {assistantKey,assistantSig,assistantText,renderFailed,userKey,userText:(user?.innerText||user?.textContent||'').trim(),userMessages:users.slice(-200).map(e=>({text:(e.innerText||e.textContent||'').trim(),key:identity(e)})),userCount:users.length,lastRole,busy,finalEvidence,editor,editorText,submit};
  }
  function reset(s){
    lastSig=s.assistantSig;changedAt=now();lastProgressSig=s.assistantSig;lastProgressAt=now();
    sawBusy=s.busy;lastGenerationObserved=s.busy;lastReplyKey=s.assistantKey;
    lastUserCount=s.userCount;lastUserKey=s.userKey;observedNewUser=false;
  }
  const blocked=t=>/(you.ve reached (?:your |the )?(?:limit|usage)|rate limit|too many requests|try again later|upgrade your plan|something went wrong|network error|response couldn.t load|captcha|verify you are human|you are out of messages)/i.test(t.slice(-1100));
  const finishOrApproval=t=>/(?:roadmap|task|work) (?:is |are )?(?:fully )?(?:complete|finished)|all (?:tasks|steps) (?:are )?(?:complete|finished)|please (?:confirm|approve|authorize)|need your (?:approval|confirmation)|requires your (?:approval|confirmation)|waiting for your (?:approval|input)|approval required/i.test(t.slice(-1100));
  async function pause(id,reason,state='PAUSED'){await send({type:'PAUSE',id,reason,state});}
  async function progress(id,state){if(state===lastState)return;const r=await send({type:'PROGRESS',id,state});if(r.ok)lastState=state;}
  async function waitForReply(id,sess,cfg,s){
    if(sess.waitingSince&&now()-sess.waitingSince>cfg.stallSeconds*1000){
      if(cfg.autoReload&&sess.recoveryCount<1&&!s.editorText){await progress(id,'AWAITING_REPLY');await send({type:'RELOAD',id});}
      else await pause(id,'No identifiable assistant reply after send. Check ChatGPT manually.');
    }else await progress(id,'AWAITING_REPLY');
  }
  async function cycle(){
    if(running||stopped)return;
    const id=getId();if(!id)return;
    running=true;
    try{
      const res=await send({type:'STATUS',id});if(!res.ok)return;
      const sess=res.session,cfg=res.settings,s=snapshot();
      let mission=res.mission;
      sessionGeneration=sess?.generation||null;
      if(sess?.enabled&&res.callerTabId!==undefined&&sess.ownerTabId!==res.callerTabId)return;
      if(activeId!==id){activeId=id;activationGeneration=null;lastState='';reset(s);}
      if(mission?.mode==='mission'&&mission.instructionState==='claimed'&&mission.id){
        const expected=`Mission Signal instruction (one time). Mission ID: ${mission.id}.`;
        const matching=s.userMessages?.find(e=>e.text.startsWith(expected));
        if(matching)await send({type:'RECONCILE_INSTRUCTION',id,userText:matching.text,userKey:matching.key,userCount:s.userCount});
      }
      if(!sess?.enabled){activationGeneration=null;lastState='';reset(s);return;}
      if(mission?.mode==='mission'){
        const sync=await send({type:'MISSION_SYNC',id});mission=sync.mission||mission;if(mission.state==='COMPLETED')return;
      }
      if(sess.documentId&&sess.documentId!==documentId){await pause(id,'Page refreshed. Review the conversation and press Start to resume.');return;}
      if(sess.state==='RECOVERING'){await pause(id,'Recovery refresh completed. Inspect the chat and re-enable manually.');return;}
      if(sess.state==='SENDING'){await pause(id,'Interrupted submission. Check the transcript before re-enabling.');return;}
      if(s.renderFailed){await pause(id,'ChatGPT could not load the latest response. Review the chat before resuming.');return;}
      if(sess.state==='ARMING'){
        // A historical reply is acknowledged, never immediately continued.
        const r=await send({type:'BASELINE',id,documentId,snapshot:{assistantKey:s.assistantKey,assistantSig:s.assistantSig,userKey:s.userKey,userCount:s.userCount,busy:s.busy}});
        if(r.ok){reset(s);activationGeneration=sess.generation;lastState='';}
        return;
      }
      if(activationGeneration!==sess.generation){
        activationGeneration=sess.generation;reset(s);
        // On reinjection/reload we must not count a preexisting answer as new.
        if(sess.state==='AWAITING_REPLY' && sess.lastClaim?.assistantKey!==s.assistantKey && s.assistantKey){
          // A possible completed reply can be recognized later but must stabilize first.
          observedNewUser=true;
        }
      }
      if(s.assistantSig!==lastSig){lastSig=s.assistantSig;changedAt=now();}
      const alerts=[...document.querySelectorAll('[role="alert"], [role="dialog"]')].filter(e=>e.getClientRects().length>0).map(e=>e.innerText||'').join(' ');
      const login=document.querySelector('[data-testid="login-button"], a[href^="/auth/login"]');
      if(login&&login.getClientRects().length){await pause(id,'Login required. Sign in to ChatGPT before resuming.');return;}
      if(blocked(alerts)||/confirm|approv|captcha|verify|sign in|log in/i.test(alerts)){await pause(id,'ChatGPT requires your attention. Review the visible alert or confirmation.');return;}
      if(!s.busy&&s.lastRole==='assistant'&&blocked(s.assistantText)){await pause(id,'ChatGPT reported a connection error or usage limit. Review the reply.');return;}
      if(s.busy){
        sawBusy=true;lastGenerationObserved=true;
        if(s.assistantSig!==lastProgressSig){lastProgressSig=s.assistantSig;lastProgressAt=now();}
        // Explicit generation/tool controls remain evidence of work even without text or when background timers are throttled.
        await progress(id,'GENERATING');
        return;
      }
      if(sawBusy){sawBusy=false;changedAt=now();lastProgressAt=now();}
      if(s.userCount>lastUserCount||s.userKey!==lastUserKey){
        if(s.userCount>=lastUserCount)observedNewUser=true;
        lastUserCount=s.userCount;lastUserKey=s.userKey;
      }
      if(!s.assistantKey||!s.assistantSig){if(sess.lastClaim||lastGenerationObserved)await waitForReply(id,sess,cfg,s);return;}
      const oldHandled=sess.lastHandled===s.assistantKey;
      const newFromBaseline=!!(sess.baseline && (s.assistantKey!==sess.baseline.assistantKey));
      const kickoff=Boolean(sess.kickoffRequested&&!sess.lastClaim&&sess.baseline?.assistantKey===s.assistantKey);
      const instruction=mission?.mode==='mission'&&mission.instructionState==='pending';
      const candidate=instruction || kickoff || (!oldHandled && !!sess.lastClaim && s.assistantKey!==sess.lastClaim.assistantKey) || (newFromBaseline && observedNewUser) || (sess.baselineStreaming && lastGenerationObserved && !oldHandled);
      if(!candidate){
        if(sess.lastClaim)await waitForReply(id,sess,cfg,s);
        return;
      }
      if(s.lastRole!=='assistant'){await progress(id,'AWAITING_REPLY');return;}
      if(now()-changedAt<cfg.settleSeconds*1000){setTimeout(()=>void cycle(),Math.max(50,cfg.settleSeconds*1000-(now()-changedAt)));await progress(id,'SETTLING');return;}
      if(!s.finalEvidence){await progress(id,'OBSERVING');return;}
      if(s.editorText){await pause(id,'Composer contains a draft. Nothing sent.');return;}
      if(!s.editor){await pause(id,'ChatGPT composer or Send control changed. Nothing sent.');return;}
      if(blocked(s.assistantText)){await pause(id,'ChatGPT reported an error or usage limit.');return;}
      if(finishOrApproval(s.assistantText)){const done=/(?:roadmap|task|work) (?:is |are )?(?:fully )?(?:complete|finished)|all (?:tasks|steps) (?:are )?(?:complete|finished)/i.test(s.assistantText.slice(-1100));if(!done||mission?.mode!=='mission'){await pause(id,done?'Roadmap completion detected.':'Human approval required.',done?'COMPLETED':'NEEDS_USER');return;}}
      if((sess.limitMode||cfg.limitMode)!=='unlimited'&&sess.turns>=(sess.maxTurns||cfg.maxTurns)){await pause(id,'Maximum auto-continue count reached.');return;}
      if(s.busy)return;
      await progress(id,'READY');
      // IMPORTANT: No click happens until claim is durably persisted.
      const claim=await send({type:'CLAIM_SEND',id,kickoff,instruction,snapshot:{assistantKey:s.assistantKey,assistantSig:s.assistantSig}});
      if(!claim.ok)return;
      let clicked=false;
      try{
        if(!getId()||getId()!==id)throw Error('Conversation navigated away');
        const permitted=await send({type:'CHECK_SEND',id,token:claim.token});if(!permitted.ok)throw Error('Paused before submission');
        const message=claim.message;
        const old=snapshot();if(old.busy||old.editorText||old.assistantKey!==s.assistantKey||old.assistantSig!==s.assistantSig)throw Error('Conversation changed during send');
        const editor=old.editor;editor.focus();
        if(editor.tagName==='TEXTAREA'){
          const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
          if(!setter)throw Error('Textarea editor unsupported');
          setter.call(editor,message);editor.dispatchEvent(new Event('input',{bubbles:true}));
        }else{
          const success=document.execCommand('insertText',false,message);
          if(!success)throw Error('Composer text insertion failed');
          editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:message}));
        }
        // React can commit editor state asynchronously. Only the first click is a send attempt;
        // bounded readiness observation here does not retry submission.
        let check;const readyDeadline=now()+4500;
        let readinessChecks=0;
        do{
          await new Promise(resolve=>setTimeout(resolve,150));
          check=snapshot();
          if(check.editorText!==message||check.busy||getId()!==id)throw Error('Composer changed before submission');
          if(check.submit&&!check.submit.disabled)break;
        }while(++readinessChecks<30&&now()<readyDeadline);
        if(!check.submit||check.submit.disabled)throw Error('Composer not ready for submission');
        const allowed=await send({type:'CHECK_SEND',id,token:claim.token});
        const final=snapshot();
        if(!allowed.ok||getId()!==id||final.busy||final.editorText!==message||final.assistantSig!==s.assistantSig||!final.submit||final.submit.disabled)throw Error('Paused or conversation changed before click');
        clicked=true; // mark before invoking external UI behavior: click may throw after submission
        final.submit.click();
        // Wait for transcript evidence, not a fixed 450 ms guess. Never click a second time.
        let acknowledged=false;const deadline=now()+10000;
        for(let attempt=0;attempt<40&&now()<=deadline;attempt++){
          const after=snapshot();
          const appeared=(after.userCount>old.userCount)||(after.userKey&&after.userKey!==old.userKey);
          if(appeared){if(after.userText!==message||after.editorText)throw Error('Submitted message could not be verified');acknowledged=true;break;}
          if(getId()!==id||!(await send({type:'CHECK_SEND',id,token:claim.token})).ok)throw Error('Paused or navigated while awaiting acknowledgment');
          await new Promise(resolve=>setTimeout(resolve,250));
        }
        if(!acknowledged)throw Error('No new submitted user message was observed');
        const confirmed=await send({type:'CONFIRM_SENT',id,token:claim.token});
        if(!confirmed.ok)throw Error('Send clicked but journal not confirmed');
        reset(snapshot());observedNewUser=false;lastState='AWAITING_REPLY';
      }catch(e){
        if(!clicked){
          const aborted=await send({type:'ABORT_UNSENT',id,token:claim.token,clicked:false}).catch(()=>null);
          if(aborted?.ok)return;
        }
        await pause(id,`Submission needs review: ${String(e.message||e)}. Check the composer/transcript; no automatic retry.`);
      }
    }catch(e){if(invalidContext(e)){shutdown();return;}if(!stopped)console.warn('[Auto-Continue]',e);}finally{running=false;}
  }
  chrome.runtime.onMessage.addListener((m,_s,r)=>{if(m.type==='PROBE'){const s=snapshot();r({ok:true,id:getId(),documentId,operational:!stopped&&Boolean(s.editor),busy:s.busy});return false;}if(m.type==='TICK'){cycle().then(()=>r({ok:true})).catch(e=>r({ok:false,error:String(e)}));return true;}});
  observer=new MutationObserver(()=>{if(!running&&!scheduled)scheduled=setTimeout(()=>{scheduled=null;void cycle();},150);});
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','data-testid','aria-busy','disabled','data-is-streaming','data-talvt-turn-state']});
  timer=setInterval(()=>void cycle(),15000);
  chrome.storage?.onChanged?.addListener(()=>void cycle());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void cycle();});
  window.addEventListener('pagehide',shutdown);
  void cycle();
})();
