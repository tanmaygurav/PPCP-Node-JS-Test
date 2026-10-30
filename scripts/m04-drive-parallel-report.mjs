import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const trials=[];
const metric=(row,name)=>Number(row?.serverTiming?.split(', ').find(s=>s.startsWith(name+';dur='))?.split('=')[1]||0);
for(const [workers,label]of [[3,'three'],[5,'five']]){
 let number=0;
 for(const suffix of ['first','repeats']){
  const report=JSON.parse(readFileSync(`test-evidence/m04/drive-parallel-${label}-${suffix}.json`,'utf8'));
  for(const c of report.conditions){
   const rows=report.samples.filter(s=>s.timestamp>=(c.measurementStartedAt||c.startedAt)&&s.timestamp<=c.finishedAt),post=endpoint=>rows.find(s=>s.method==='POST'&&s.endpoint===endpoint),create=post('submissions'),edit=post('submissions/:id/edits');
   trials.push({workers,trial:++number,source:report.source,startedAtUTC:c.startedAt,startedAtIST:new Date(c.startedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),prepareMs:post('upload-sessions')?.ms,transferMs:rows.filter(s=>s.endpoint==='drive-transfer').reduce((a,s)=>a+s.ms,0),createMs:create?.ms,editMs:edit?.ms,createAcknowledgmentMs:rows.find(s=>s.endpoint==='workflow/save-ack')?.ms,publicationWallMs:metric(create,'drive-publish-wall'),publicationWorkMs:metric(create,'drive-publish'),sharingWorkMs:metric(create,'drive-sharing'),peakDriveRequests:Math.max(0,...rows.map(s=>s.observed?.driveActivePeak||0)),driveApiRequests:rows.reduce((a,s)=>a+(s.observed?.driveRequests||0),0),state:c.state,hard:c.hard,anonymousViews:c.anonymousDriveViews||0,completed:c.completed,reportedFailures:report.failures.length});
  }
 }
}
const baseline=JSON.parse(readFileSync('test-evidence/m04/capacity-ten-file-boundary.json','utf8')),before=baseline.conditions[0].groups;
const final=trials.filter(t=>t.workers===5),accepted=final.length===3&&final.every(t=>t.completed===1&&!t.hard&&!t.reportedFailures&&t.anonymousViews>=1&&t.createMs<=3000&&t.editMs<=3000);
const result={generatedAtUTC:new Date().toISOString(),baseline:{source:baseline.source,startedAt:baseline.startedAt,createMs:before['POST submissions'].p95,editMs:before['POST submissions/:id/edits'].p95,sampleSize:1},trials,fiveWorkerFinalSaveGatePassed:accepted,populationCapacityCertified:false};
const seconds=n=>(n/1000).toFixed(2)+'s';
const lines=['# M04 ten-file Drive comparison','',`Generated ${result.generatedAtUTC}. Each row is one independent uploader workflow, not a population p95. The earlier sequential baseline was measured on a different day.`, '',`Earlier sequential observed create/edit: **${seconds(result.baseline.createMs)} / ${seconds(result.baseline.editMs)}**.`, '', '| File workers | Trial | Prepare API | Transfer total | Final create | Retained edit | Create acknowledgment | Publish wall | Active Drive peak |','|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
for(const t of trials)lines.push(`| ${t.workers} | ${t.trial} | ${seconds(t.prepareMs)} | ${seconds(t.transferMs)} | ${seconds(t.createMs)} | ${seconds(t.editMs)} | ${seconds(t.createAcknowledgmentMs)} | ${seconds(t.publicationWallMs)} | ${t.peakDriveRequests} |`);
lines.push('',`Three-trial five-worker final-save gate: **${accepted?'passed':'failed'}** (every create/edit must be ≤3 seconds, with successful integrity/anonymous checks).`, '', 'Each trial retained ten 1,000,000-byte files, serial direct transfers, the browser observer and create/edit/lock/remark/unlock workflow. Instance-wide permits stayed at six. Prepare and acknowledgment include multiple phases; they must not be added again to their component timings. Per-file metadata/sharing/publication work overlaps; use publication wall time for elapsed phase comparison.', '', 'UTC/IST timestamps, full source hashes, API counts and per-file work totals are in the companion JSON. Production and higher-load acceptance remain separate.');
mkdirSync('output/m04',{recursive:true});writeFileSync('output/m04/DRIVE_PARALLEL_RESULTS.json',JSON.stringify(result,null,2));writeFileSync('output/m04/DRIVE_PARALLEL_RESULTS.md',lines.join('\n')+'\n');console.log('Wrote output/m04/DRIVE_PARALLEL_RESULTS.md and .json');
