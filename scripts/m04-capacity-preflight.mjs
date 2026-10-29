import { writeFileSync, mkdirSync,existsSync,readFileSync } from 'node:fs';
import { loadM04Env,m04Config } from '../src/m04/config.mjs';
import { services } from '../src/m04/auth.mjs';
loadM04Env();const config=m04Config();if(config.projectId!=='ppcp-m04-redesign'||config.emulator)throw new Error('M04 real-resource inspection only.');const {auth,db}=services(config);
const result={projectId:config.projectId,checkedAt:new Date().toISOString(),billingDisabled:null,usage:{},unavailable:[],note:'Rolling 24h usage is conservative around daily quota resets. Provider metrics can be delayed; reserve headroom.'};
const previous=existsSync('.local/m04-capacity-headroom.json')?JSON.parse(readFileSync('.local/m04-capacity-headroom.json','utf8')):null;
try{
  const {access_token}=await auth.app.options.credential.getAccessToken();const headers={Authorization:`Bearer ${access_token}`};
  async function request(url){const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Inspection returned ${response.status}.`);return response.json();}
  try{const billing=await request(`https://cloudbilling.googleapis.com/v1/projects/${config.projectId}/billingInfo`);result.billingDisabled=billing.billingEnabled===false;}catch{result.unavailable.push('billing status');}
  for(const operation of ['read','write','delete']){
    try{const params=new URLSearchParams({filter:`metric.type="firestore.googleapis.com/document/${operation}_count" AND resource.labels.project_id="${config.projectId}"`,'interval.startTime':new Date(Date.now()-86400000).toISOString(),'interval.endTime':new Date().toISOString(),'aggregation.alignmentPeriod':'86400s','aggregation.perSeriesAligner':'ALIGN_SUM',pageSize:'1000'});const body=await request(`https://monitoring.googleapis.com/v3/projects/${config.projectId}/timeSeries?${params}`);result.usage[operation]=Math.ceil((body.timeSeries||[]).flatMap(s=>s.points||[]).reduce((sum,p)=>sum+Number(p.value?.int64Value||p.value?.doubleValue||0),0));}catch{result.unavailable.push(`Firestore ${operation} usage`);}
  }
  try{const quota=await request(`https://serviceusage.googleapis.com/v1/projects/${config.projectId}/services/drive.googleapis.com/consumerQuotaMetrics?view=FULL&pageSize=200`);result.driveQuotaMetrics=(quota.metrics||[]).map(metric=>({metric:metric.metric,limits:(metric.consumerQuotaLimits||[]).map(limit=>({unit:limit.unit,buckets:(limit.quotaBuckets||[]).map(bucket=>({effectiveLimit:bucket.effectiveLimit,dimensions:bucket.dimensions}))}))}));}catch{result.unavailable.push('Drive project/user quota configuration');}
  if(previous?.ownerReported&&previous.projectId===config.projectId&&Date.now()-Date.parse(previous.checkedAt)<3600000){
    result.inspectedAt=result.checkedAt;result.checkedAt=previous.checkedAt;result.ownerReported=previous.ownerReported;result.drive=previous.drive;result.vercel=previous.vercel;
    if(result.billingDisabled===null)result.billingDisabled=previous.billingDisabled;
    for(const key of ['read','write','delete'])if(!Number.isFinite(result.usage[key]))result.usage[key]=previous.usage[key];
    result.note='Automated inspection could not cover all services. Fresh owner-reported dashboard figures retained with their original timestamp; no freshness extension.';
  }
  result.ready=result.billingDisabled===true&&['read','write','delete'].every(key=>Number.isFinite(result.usage[key]))&&!!result.drive&&!!result.vercel;
  mkdirSync('.local',{recursive:true});mkdirSync('output/m04',{recursive:true});writeFileSync('.local/m04-capacity-headroom.json',JSON.stringify(result,null,2));writeFileSync(`output/m04/capacity-preflight-${Date.now()}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await db.terminate();}
