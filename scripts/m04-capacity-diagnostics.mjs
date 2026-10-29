import { chromium } from 'playwright';
import { browserProbe } from './m04-capacity-browser.mjs';
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID,createHash } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { environment,accountPool,client,endpoint } from './m04-test-support.mjs';
import { Budget } from './m04-capacity-budget.mjs';
if(!process.argv.includes('--write'))throw new Error('Synthetic diagnostics require --write.');
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=')||fallback;
const maximum=Number(arg('users','5')),seconds=Number(arg('seconds','180')),scenario=arg('scenario','all');
const ladder=[1,5,10,20,40,60,90,120,...(maximum>120?[160,200]:[])];
if(!ladder.includes(maximum)||seconds!==180&&!process.argv.includes('--smoke')||seconds<1||seconds>180||!['all','baseline','browsing','metadata','mixed','arrival','ten-files','seed'].includes(scenario))throw new Error('Use approved stages, --seconds=180; shorter runs need --smoke and cannot certify capacity.');
const context=await environment();
if(!process.argv.includes('--production-window')&&!new URL(context.origin).hostname.includes('-git-'))throw new Error('Heavier tests require Preview. Production requires an agreed quiet window and --production-window.');
const headroom=JSON.parse(readFileSync('.local/m04-capacity-headroom.json','utf8')),budget=new Budget(headroom);context.beforeRequest=budget.beforeRequest;context.afterRequest=row=>{budget.afterRequest(row);if(typeof row.status!=='number'||row.status>=400||Object.keys(row.observed||{}).some(k=>/^driveStatus(401|403|429|5\d\d)$/.test(k)&&row.observed[k]>0))stop=true;};context.beforeUpload=budget.beforeUpload;
const samples=[],reports=[],runIds=[],failures=[],globalIds=new Set(),source=context.deployedSource||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(source))throw new Error('Inspect deployed application source before testing.');
if(!process.argv.includes('--smoke'))execFileSync('git',['diff','--quiet',source,'--','src/m04','api/m04.js','m04-web','vercel.json','package.json','package-lock.json']);
const cpuStart=process.cpuUsage(),started=performance.now(),lag=monitorEventLoopDelay({resolution:20});lag.enable();let stop=false;
mkdirSync('output/m04',{recursive:true});
const harnessDigest=createHash('sha256').update(['scripts/m04-capacity-diagnostics.mjs','scripts/m04-test-support.mjs','scripts/m04-capacity-budget.mjs','scripts/m04-capacity-browser.mjs'].map(p=>readFileSync(p,'utf8')).join('\n')).digest('hex');
const reportPath=`output/m04/capacity-diagnostics-${Date.now()}.json`;
function persist(){writeFileSync(reportPath,JSON.stringify({source,harnessDigest,indexManifestDigest:createHash('sha256').update(readFileSync('firestore.m04.indexes.json')).digest('hex'),origin:context.origin,startedAt:new Date(Date.now()-(performance.now()-started)).toISOString(),target:maximum,durationSeconds:seconds,smoke:process.argv.includes('--smoke'),capacityCertified:false,conditions:reports,runIds,failures,budget:{limits:budget.limits,vercelLimits:budget.vercelLimits,estimated:budget.totals()},generator:{cpu:process.cpuUsage(cpuStart),elapsedMs:performance.now()-started,eventLoopP95ms:lag.percentile(95)/1e6,rssBytes:process.memoryUsage().rss},samples},null,2));}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function stats(rows){const values=rows.filter(r=>typeof r.status==='number'&&r.status<400).map(r=>r.ms).sort((a,b)=>a-b),q=p=>values.length?values[Math.ceil(values.length*p)-1]:null;return{count:rows.length,success:values.length,failures:rows.filter(r=>typeof r.status!=='number'||r.status>=400).length,p50:q(.5),p95:q(.95),max:values.at(-1)||null};}
function classify(rows){const groups={};for(const row of rows){const key=row.method+' '+row.endpoint;(groups[key]||=[]).push(row);}return Object.fromEntries(Object.entries(groups).map(([key,value])=>[key,stats(value)]));}
function gates(rows){const groups=classify(rows),timed=['GET submissions','GET submissions/:id','POST submissions','POST submissions/:id/edits'];const latencies=timed.filter(k=>groups[k]?.p95!=null).map(k=>({endpoint:k,p95:groups[k].p95,target:k.startsWith('GET')?2000:3000}));const hard=rows.some(r=>typeof r.status!=='number'||r.status>=400)||Object.entries(groups).some(([key,value])=>/^(GET|POST) /.test(key)&&value.p95>10000)||latencies.some(v=>v.p95>10000)||lag.percentile(95)/1e6>200;return{hard,latencyPassed:latencies.every(v=>v.p95<=v.target),latencies,groups};}
async function save(actor,runId,files=[],current=null){
  if(stop)throw new Error('Stage stopped before the next save.');
  let transferMs=0;const op=randomUUID(),begin=performance.now(),values={title:`[LOAD TEST · ${runId.slice(0,8)}] ${current?'Edited':'New'} ${op.slice(0,8)}`,domain:'Education',description:'Independent synthetic capacity condition.',solution:''},prepared=await actor.api('upload-sessions',{operationId:op,files,...(current?{submissionId:current.id,expectedVersion:current.version,retainedIds:current.media.map(f=>f.id)}:{})});
  try{
    for(const file of prepared.uploads){budget.beforeUpload(file.size);const bytes=Buffer.alloc(file.size,32);bytes.write('%PDF-1.4\n');const start=performance.now();let status='network-error';context.activeTransfers=(context.activeTransfers||0)+1;context.peakTransfers=Math.max(context.peakTransfers||0,context.activeTransfers);try{const response=await fetch(file.uploadUrl,{method:'PUT',headers:{'Content-Type':file.mimeType},body:bytes,signal:AbortSignal.timeout(120000)});await response.arrayBuffer();status=response.status;if(!response.ok)throw new Error('Drive transfer failed: '+status);}finally{context.activeTransfers--;const elapsed=performance.now()-start;transferMs+=elapsed;samples.push({endpoint:'drive-transfer',method:'PUT',timestamp:new Date().toISOString(),ms:performance.now()-start,status,bytes:file.size});}}
    const data={...values,operationId:op,uploadId:prepared.uploadId,...(current?{expectedVersion:current.version}:{})},path=current?`submissions/${current.id}/edits`:'submissions';let receipt;
    try{receipt=await actor.api(path,data);}catch(error){const observed=await actor.api(`operations/${op}`);if(observed.status!=='committed')throw error;receipt=observed;}
    samples.push({endpoint:'workflow/save-ack',method:'WORKFLOW',timestamp:new Date().toISOString(),ms:performance.now()-begin,status:200});samples.push({endpoint:'workflow/save-metadata',method:'WORKFLOW',timestamp:new Date().toISOString(),ms:performance.now()-begin-transferMs,status:200});const item=(await actor.api(`submissions/${receipt.submissionId}`)).item;if(item.ownerUid!==actor.uid||item.testRunId!==runId||item.title!==values.title||item.version!==(current?current.version+1:1))throw new Error('INTEGRITY: save ownership, run, content or version mismatch.');
    if(!/^PP\d+$/.test(item.displayId)||Number(item.displayId.slice(2))!==item.sequence||(!current&&globalIds.has(item.displayId)))throw new Error('INTEGRITY: readable/numeric ID mismatch.');if(!current)globalIds.add(item.displayId);if(current&&current.media.some(file=>!item.media.some(next=>next.id===file.id)))throw new Error('INTEGRITY: retained attachment changed.');
    samples.push({endpoint:'workflow/save-verified',method:'WORKFLOW',timestamp:new Date().toISOString(),ms:performance.now()-begin,status:200,bytes:files.reduce((n,f)=>n+f.size,0)});return item;
  }catch(error){stop=true;throw error;}
}
const ticker=setInterval(()=>console.log(JSON.stringify({phase:'running',activeRequests:context.inFlight||0,peak:context.peakInFlight||0,budget:budget.totals()})),30000);ticker.unref();
let control,pool,browser;
try{
  const requestedStaff=Math.max(4,Math.ceil(maximum*.12)+4),existing=existsSync('.local/m04-accounts.json')?JSON.parse(readFileSync('.local/m04-accounts.json','utf8')):null,needed=Math.max(0,maximum+1-(existing?.students?.length||0))+Math.max(0,requestedStaff-(existing?.capacityStaff?.length||0));budget.check(needed*4,needed*4);pool=await accountPool(context,maximum+1,true,requestedStaff);budget.record({reads:needed*4,writes:needed*4});
  control=await client(context,pool.admin,samples);browser=await chromium.launch({headless:true});budget.record({reads:20,writes:0});
  const reference=await context.db.collection('submissions').where('displayId','==','PP039').limit(1).get(),referenceBefore=JSON.stringify(reference.docs[0]?.data());
  const tasks=scenario==='all'?['baseline','browsing','metadata','mixed','arrival']: [scenario];
  let levels=scenario==='baseline'?[1]:ladder.filter(n=>n<=maximum);
  if(arg('repeat-of','')){const prior=JSON.parse(readFileSync(arg('repeat-of',''),'utf8'));if(prior.origin!==context.origin||prior.source!==source||!prior.conditions.some(c=>c.targetActiveUsers===maximum&&c.scenario===scenario&&['passed','latency-failed'].includes(c.state)&&!c.hard))throw new Error('Repeat requires a matching safe prior condition.');levels=[maximum,maximum];}
  let diagnosticAlready=false;
  for(const users of levels){let levelLatencyFailed=false;
    for(const mode of tasks){if(stop)break;if(mode==='baseline'&&users!==1)continue;if(mode==='ten-files'&&![1,5,20].includes(users))continue;
      const studentCount=mode==='mixed'&&users>=3?users-Math.max(1,Math.round(users*.08))-Math.max(1,Math.round(users*.02)):users;
      const staff=mode==='mixed'&&users>=3?[...pool.capacityStaff.filter(a=>a.role==='faculty').slice(0,Math.max(1,Math.round(users*.08))),...pool.capacityStaff.filter(a=>a.role==='admin').slice(0,Math.max(1,Math.round(users*.02)))]:[],accounts=[...pool.students.slice(0,studentCount),...staff];
      const controllerFaculty=staff.find(a=>a.role==='faculty')||pool.faculty,memberUids=[...new Set([...accounts.map(a=>a.uid),controllerFaculty.uid])];
      const receipt=await control.api('admin/test-runs',{operationId:randomUUID(),name:`${mode} / ${users} active users`,scenario:mode,concurrency:users,durationSeconds:seconds,datasetTarget:mode==='seed'?Number(arg('dataset','100')):0,members:memberUids,source,origin:context.origin});const runId=receipt.runId;context.runId=runId;runIds.push(runId);persist();
      const condition={runId,scenario:mode,targetActiveUsers:users,roles:{student:accounts.filter(a=>a.role==='student').length,faculty:accounts.filter(a=>a.role==='faculty').length,admin:accounts.filter(a=>a.role==='admin').length},source,datasetSize:(await context.db.collection('submissions').count().get()).data().count,durationSeconds:seconds,thinkSeconds:[10,20],startedAt:new Date().toISOString(),attachmentMix:'70% none / 25% 1MB / 5% 2x5MB',readPattern:'Portal fan-out: me + list; me + detail + remarks, parallel within a screen; 10–20s per cycle',expected:'Correct IDs/ownership/versioning; list/detail p95<=2000ms; create/edit p95<=3000ms excluding transfer',state:'running'};reports.push(condition);persist();
      const actors=[];if(mode!=='arrival')for(const account of accounts)actors.push(await client(context,account,samples));const faculty=await client(context,controllerFaculty,samples);
      const stageStart=samples.length,cpu=process.cpuUsage(),stageBegin=performance.now();context.peakInFlight=0;context.peakTransfers=0;condition.measurementStartedAt=new Date().toISOString();lag.reset();const seen=new Set();let completed=0;
      const observer=mode==='arrival'||mode==='seed'?Promise.resolve():browserProbe(browser,context,actors[0],samples).catch(error=>{stop=true;failures.push('Browser observer: '+error.message);});
      const results=await Promise.allSettled(accounts.map(async(account,i)=>{
        let actor=actors[i];if(mode==='arrival'){actor=await client(context,account,samples);await actor.api('me');completed++;return;}
        if(mode==='seed'){const target=Math.max(0,Number(arg('dataset','100'))-condition.datasetSize);if(i)return;for(let n=0;n<target;n++)await save(actor,runId);completed++;return;}
        const think=async()=>{if(stop)throw new Error('Stage stopped before the next mutation.');if(!process.argv.includes('--smoke'))await sleep(10000+Math.random()*10000);if(stop)throw new Error('Stage stopped before the next mutation.');};let own=null;const until=performance.now()+seconds*1000;let iteration=0;
        if(!process.argv.includes('--smoke')&&i)await sleep((i%10)*1000);
        do{
          if(stop)break;
          if(account.role!=='student'||mode==='browsing'||mode==='baseline'){
            const params=account.role==='student'?'limit=20':'limit=20&domain=Education&sort=newest';const [,list]=await Promise.all([actor.api('me'),actor.api('submissions?'+params)]);if(list.items.length){const item=list.items[i%list.items.length];await Promise.all([actor.api('me'),actor.api(`submissions/${item.id}`),actor.api(`submissions/${item.id}/remarks`)]);}if(mode==='baseline')break;
          }else if(iteration===0){
            let files=[];if(mode==='mixed'){const large=Math.round(studentCount*.05),typical=Math.round(studentCount*.25);if(i>=studentCount-large)files=[{name:'large-a.pdf',size:5000000},{name:'large-b.pdf',size:5000000}];else if(i>=studentCount-large-typical)files=[{name:'typical.pdf',size:1000000}];}if(mode==='ten-files')files=Array.from({length:10},(_,n)=>({name:`boundary-${n}.pdf`,size:1000000}));
            own=await save(actor,runId,files);if(seen.has(own.displayId))throw new Error('INTEGRITY: duplicate readable ID.');seen.add(own.displayId);await think();own=await save(actor,runId,[],own);await think();await actor.api(`submissions/${own.id}/lock`,{operationId:randomUUID(),expectedVersion:own.version});await think();await faculty.api(`submissions/${own.id}/remarks`,{operationId:randomUUID(),remark:'Synthetic capacity review.'});await think();await faculty.api(`submissions/${own.id}/unlock`,{operationId:randomUUID(),expectedVersion:own.version+1});const checked=(await actor.api(`submissions/${own.id}`)).item;if(checked.locked||checked.version!==own.version+2||checked.media.length!==own.media.length)throw new Error('INTEGRITY: lock/review workflow mismatch.');
          }else{await Promise.all([actor.api('me'),actor.api('submissions?limit=20')]);if(own)await Promise.all([actor.api('me'),actor.api(`submissions/${own.id}`),actor.api(`submissions/${own.id}/remarks`)]);}
          iteration++;if(mode==='ten-files')break;if(mode==='metadata'){await sleep(Math.max(0,until-performance.now()));break;}const remaining=until-performance.now();if(remaining>0)await sleep(Math.min(10000+Math.random()*10000,remaining));
        }while(performance.now()<until&&!stop);completed++;
      } ).map(promise=>promise.catch(error=>{stop=true;throw error;})));
      await observer;
      for(const result of results)if(result.status==='rejected'){stop=true;failures.push(result.reason.message);}
      const rows=samples.slice(stageStart),gate=gates(rows);Object.assign(condition,{state:stop||gate.hard?'stopped':gate.latencyPassed?'passed':'latency-failed',finishedAt:new Date().toISOString(),elapsedMs:performance.now()-stageBegin,completed,actualPeakRequests:context.peakInFlight,actualPeakTransfers:context.peakTransfers,requests:rows.length,requestsPerSecond:rows.length/((performance.now()-stageBegin)/1000),...gate,generator:{cpu:process.cpuUsage(cpu),eventLoopP95ms:lag.percentile(95)/1e6,rssBytes:process.memoryUsage().rss}});persist();console.log(JSON.stringify({runId,users,scenario:mode,state:condition.state,completed,latencies:gate.latencies,budget:budget.totals()}));
      budget.cleanup=true;try{await control.api(`admin/test-runs/${runId}/results`,{operationId:randomUUID(),...condition,smoke:process.argv.includes('--smoke')});}finally{budget.cleanup=false;}context.runId=null;
      if(gate.hard)stop=true;if(!gate.latencyPassed)levelLatencyFailed=true;
    }
    if(levelLatencyFailed){if(diagnosticAlready)stop=true;diagnosticAlready=true;}if(stop)break;
  }
  if(JSON.stringify((await reference.docs[0].ref.get()).data())!==referenceBefore)throw new Error('INTEGRITY: PP039 changed during the test window.');
}catch(error){failures.push(error.message);stop=true;console.error(error.message);}
finally{if(control){budget.cleanup=true;for(const runId of runIds)try{await control.api(`admin/test-runs/${runId}/close`,{operationId:randomUUID()});}catch{failures.push('Run closure requires admin reconciliation: '+runId);}}clearInterval(ticker);lag.disable();persist();console.log('Sanitized report: '+reportPath);if(browser)await browser.close();await context.db.terminate();if(stop)process.exitCode=1;}
