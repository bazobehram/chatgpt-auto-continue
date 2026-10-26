'use strict';
// Runs only in the extension worker. Capabilities never enter a ChatGPT message.
globalThis.MissionSignal=(()=>{
  const ENDPOINT='https://mission-signal.synovaq.org';
  const key=id=>'mission:'+id;
  const get=async id=>(await chrome.storage.local.get(key(id)))[key(id)]||{mode:'local'};
  const historyKey=id=>'mission-history:'+id;
  const getHistory=async id=>(await chrome.storage.local.get(historyKey(id)))[historyKey(id)]||[];
  const put=async(id,m)=>{
    await chrome.storage.local.set({[key(id)]:m});
    if(m.id&&['COMPLETED','CANCELLED'].includes(m.state)){
      const entries=await getHistory(id);
      if(!entries.some(e=>e.id===m.id)){
        entries.unshift({id:m.id,state:m.state,recordedAt:Date.now()});
        await chrome.storage.local.set({[historyKey(id)]:entries.slice(0,12)});
      }
    }
  };
  const connection=async()=>(await chrome.storage.local.get('missionConnection')).missionConnection||{endpoint:ENDPOINT};
  const summary=m=>({mode:m.mode||'local',id:m.id||null,state:m.state||null,connection:m.connection||'unconfigured',offlineAttempts:m.offlineAttempts||0,instructionState:m.instruction?.state||null,lastChecked:m.lastChecked||0});
  async function request(path,token,method='GET',body){
    const c=await connection();if(c.endpoint!==ENDPOINT)throw Error('Unsupported Mission Signal endpoint');
    const response=await fetch(ENDPOINT+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000),redirect:'error',cache:'no-store',credentials:'omit'});
    if(!response.ok)throw Error('Mission Signal request failed');
    return response.json();
  }
  function verify(m,r,id){if(r.id!==m.id||r.conversation_id!==id||!['ACTIVE','COMPLETED','CANCELLED'].includes(r.state))throw Error('Mission identity mismatch');}
  async function synchronize(id,force=false){
    let m=await get(id);if(m.mode!=='mission'||!m.id||!m.registered)return m;
    if(!force&&Date.now()-(m.lastChecked||0)<15000)return m;
    try{const r=await request('/v1/missions/'+m.id,m.readToken);verify(m,r,id);m={...m,state:r.state,connection:'connected',offlineAttempts:0,lastChecked:Date.now()};}
    catch{m={...m,connection:'disconnected',lastChecked:Date.now()};}
    await put(id,m);return m;
  }
  async function ensure(id){
    let m=await get(id);if(m.mode!=='mission')return m;
    if(m.instruction?.state==='claimed'||m.instruction?.state==='ambiguous')throw Error('Mission instruction submission is uncertain. Review the transcript before replacing the mission.');
    if(!m.id){
      const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
      m={mode:'mission',id:crypto.randomUUID(),readToken:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),state:'ACTIVE',registered:false,connection:'disconnected',offlineAttempts:0,instruction:{state:'pending'}};
      await put(id,m);
    }
    if(!m.registered){
      const c=await connection();if(!c.enrollment)throw Error('Configure Mission Signal before starting a mission.');
      try{const r=await request('/v1/missions',c.enrollment,'POST',{id:m.id,conversation_id:id,read_token:m.readToken});verify(m,r,id);m={...m,registered:true,state:r.state,connection:'connected',lastChecked:Date.now()};await put(id,m);}
      catch{throw Error('Mission registration unavailable. Nothing sent. Retry when connected.');}
    }
    return synchronize(id,true);
  }
  const instruction=id=>`Mission Signal instruction (one time). Mission ID: ${id}. Complete the agreed roadmap first. Verify every task and its acceptance checks before completion. Intermediate milestones must not trigger completion. Only after the entire roadmap is verified finished, use CommandCore's existing shell.exec on the device named homeserver to run: mission-signal complete ${id}. The homeserver CLI authenticates locally; no secret is included here. If completion fails, report it and do not claim the mission is complete.`;
  async function claimInstruction(id){
    const m=await synchronize(id,true);
    if(m.connection!=='connected'||m.state!=='ACTIVE'||m.instruction?.state!=='pending')return null;
    const token=crypto.randomUUID();await put(id,{...m,instruction:{state:'claimed',token,claimedAt:Date.now()}});
    return {token,message:instruction(m.id)};
  }
  async function acknowledgeInstruction(id,token){const m=await get(id);if(m.instruction?.token!==token||m.instruction.state!=='claimed')return false;await put(id,{...m,instruction:{...m.instruction,state:'sent',sentAt:Date.now()}});return true;}
  async function releaseUnsentInstruction(id,token){
    const m=await get(id);
    if(m.mode!=='mission'||m.instruction?.state!=='claimed'||m.instruction.token!==token)return false;
    await put(id,{...m,instruction:{state:'pending',recoveryRequired:true}});
    return true;
  }
  async function beforeContinuation(id){
    const m=await synchronize(id,true);if(m.mode!=='mission')return {ok:true};
    if(m.state==='COMPLETED')return {ok:false,completed:true};
    if(m.state==='CANCELLED')return {ok:false,error:'Mission was cancelled.'};
    if(!m.registered||m.instruction?.state!=='sent')return {ok:false,error:'Mission instruction must be confirmed before continuing.'};
    if(m.connection!=='connected'){
      if((m.offlineAttempts||0)>=5)return {ok:false,error:'Mission Signal disconnected. Five offline attempts exhausted.'};
      await put(id,{...m,offlineAttempts:(m.offlineAttempts||0)+1});
    }
    return {ok:true};
  }
  async function cancel(id){
    const m=await get(id);
    if(m.mode!=='mission'||!m.id)return m;
    if(m.registered){
      const r=await request('/v1/missions/'+m.id+'/cancel',m.readToken,'POST');
      verify(m,r,id);
      if(r.state!=='CANCELLED'&&r.state!=='COMPLETED')throw Error('Unexpected mission cancellation status');
      const next={...m,state:r.state,connection:'connected',lastChecked:Date.now()};
      await put(id,next);return next;
    }
    const next={...m,state:'CANCELLED',registered:false,connection:'connected'};
    await put(id,next);return next;
  }
  async function setMode(id,mode){if(!['local','mission'].includes(mode))throw Error('Choose Local Only or Mission Signal.');const m=await get(id);if(m.mode==='mission'&&mode==='local'&&m.registered&&m.state==='ACTIVE')throw Error('Cancel the active mission before switching to Local Only.');await put(id,{...m,mode});}
  async function verifyEnrollment(enrollment){
    const candidate=String(enrollment||'').trim();
    if(!candidate)throw Error('Enter the enrollment key before saving.');
    const r=await request('/v1/enrollment/verify',candidate,'POST');
    if(r?.configured!==true)throw Error('Enrollment verification failed.');
    return true;
  }
  async function configure(enrollment){const c=await connection();await chrome.storage.local.set({missionConnection:{endpoint:ENDPOINT,enrollment:String(enrollment||c.enrollment||'').trim()}});}
  return {get,put,getHistory,verifyEnrollment,summary,connection,synchronize,ensure,instruction,claimInstruction,acknowledgeInstruction,releaseUnsentInstruction,beforeContinuation,cancel,setMode,configure,ENDPOINT};
})();
