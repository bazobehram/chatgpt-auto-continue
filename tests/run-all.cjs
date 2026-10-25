const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const steps=[
 ['unit',process.execPath,['--test','tests/controller.test.cjs']],
 ['smoke',process.env.QA_PYTHON||'python',['tests/smoke.py']],
 ['service',process.env.QA_PYTHON||'python',['-m','pytest','mission-signal/tests','-q']],
 ['browser',process.execPath,['tests/browser.test.cjs']],
 ['acceptance',process.execPath,['tests/acceptance.test.cjs']],
 ['limits',process.execPath,['tests/limits.test.cjs']],
 ['mission',process.execPath,['tests/mission.test.cjs']]
];
const results=[];
for(const [name,command,args] of steps){
 console.log(`\nRUN ${name}`);
 const r=spawnSync(command,args,{cwd:root,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'},timeout:240000});
 const output=(r.stdout||'')+(r.stderr||'');process.stdout.write(output);
 results.push({name,status:r.status===0?'PASS':'FAIL',exitCode:r.status,error:r.error?.message,output});
}
fs.writeFileSync(path.join(__dirname,'full-test-results.json'),JSON.stringify({date:new Date().toISOString(),version:'0.5.0',results},null,2));
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
