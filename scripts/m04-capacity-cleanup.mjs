import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import { environment,client } from './m04-test-support.mjs';
import { Budget } from './m04-capacity-budget.mjs';
const context=await environment(),pool=JSON.parse(readFileSync('.local/m04-accounts.json','utf8')),samples=[];
const budget=new Budget(JSON.parse(readFileSync('.local/m04-capacity-headroom.json','utf8')),{cleanup:true});context.beforeRequest=budget.beforeRequest;context.afterRequest=budget.afterRequest;
try{
  const actor=await client(context,pool.admin,samples),reportArg=process.argv.find(a=>a.startsWith('--report=')),idsArg=process.argv.find(a=>a.startsWith('--runs='));let runIds=idsArg?idsArg.slice(7).split(','):reportArg?JSON.parse(readFileSync(reportArg.slice(9),'utf8')).runIds:[];
  if(process.argv.includes('--all')){let cursor='';do{const page=await actor.api('admin/test-runs?cursor='+encodeURIComponent(cursor));runIds.push(...page.items.map(r=>r.id));cursor=page.nextCursor||'';}while(cursor);}
  runIds=[...new Set(runIds)];if(!runIds.length||runIds.length>200)throw new Error('Select 1–200 explicit run IDs, --report=path, or --all.');
  const preview=[];for(const id of runIds){for(const uploads of [false,true]){let cursor='';do{const page=await actor.api(`admin/test-runs/${id}?cursor=${encodeURIComponent(cursor)}&uploads=${uploads}`);preview.push({runId:id,kind:uploads?'uploads':'submissions',items:page.items});cursor=page.nextCursor||'';}while(cursor);}}
  console.log(JSON.stringify({preview,apply:process.argv.includes('--apply'),notice:'Only trusted marked data; files go to Drive Trash. Accounts/reports remain.'}));
  if(process.argv.includes('--apply')){
    if(!process.argv.includes('--write'))throw new Error('Cleanup writes require --write --apply.');
    const key=createHash('sha256').update(JSON.stringify([...runIds].sort())).digest('hex').slice(0,16),path=`.local/m04-cleanup-${key}.json`,checkpoint=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{operationId:randomUUID(),runIds};writeFileSync(path,JSON.stringify(checkpoint));
    if(!checkpoint.jobId){checkpoint.jobId=(await actor.api('admin/test-cleanup',{operationId:checkpoint.operationId,runIds,confirmation:'DELETE TEST DATA'})).jobId;writeFileSync(path,JSON.stringify(checkpoint));}
    for(let i=0;i<300;i++){const result=await actor.api(`admin/test-cleanup/${checkpoint.jobId}/retry`,{operationId:randomUUID(),lean:true});console.log(JSON.stringify({jobId:checkpoint.jobId,status:result.job.status,phase:result.job.phase,filesRemaining:result.job.filesRemaining,message:result.job.message,retryAfter:result.job.retryAfter}));if(result.job.status!=='pending'){console.log(JSON.stringify(await actor.api(`admin/test-cleanup/${checkpoint.jobId}`)));break;}await new Promise(resolve=>setTimeout(resolve,500));}
  }
}finally{await context.db.terminate();}
