import { randomUUID } from 'node:crypto';
import { AppError, digest, identifier, requireRole, text } from './domain.mjs';
export const testPrefix = id => `[LOAD TEST · ${id.slice(0,8)}]`;
const synthetic = user => /^m04-poc-[a-f0-9]{8}-(s\d+|f\d+|a\d+|faculty|admin)$/.test(user?.uid || '') && user.email?.split('@')[0] === user.uid;
export async function testGate(store, tx, profile, resource = null) {
  const user = (await tx.get(store.ref('users', profile.uid))).data();
  const runId = resource?.testRunId || (user?.testAccount ? user.testRunId : null);
  if (!runId) return null;
  const run = (await tx.get(store.ref('testRuns', runId))).data();
  if (!run || run.status !== 'active' || (resource && (!resource.testRunId || !run.members.includes(resource.ownerUid))) || (user?.testAccount && (!run.members.includes(user.uid) || user.testRunId !== runId))) throw new AppError(409, 'Test run is closed or does not own this resource.');
  if (user?.testAccount && resource && resource.testRunId !== user.testRunId) throw new AppError(403, 'Test accounts cannot change unmarked or foreign-run submissions.');
  return runId;
}
export class TestRuns {
  constructor(store) { this.store = store; }
  get db() { return this.store.db; }
  ref(name, id) { return this.store.ref(name, id); }
  async admin(profile) { const actual=await this.store.profile(profile.uid);if(!actual)throw new AppError(403,'Administrator access unavailable.');requireRole(actual, ['admin']); }
  async create(profile, data) {
    await this.admin(profile);
    if (!Array.isArray(data.members) || !data.members.length || data.members.length > 220 || new Set(data.members).size !== data.members.length) throw new AppError(400, 'Assign 1–220 distinct synthetic account UIDs.');
    data.members.forEach(id => identifier(id));
    const condition = { name: text(data.name, 'Test condition', 150), scenario: text(data.scenario, 'Scenario', 60), concurrency: Number(data.concurrency), durationSeconds: Number(data.durationSeconds), datasetTarget: Number(data.datasetTarget || 0), thinkMin: 10, thinkMax: 20, attachmentMix: '70% none / 25% 1MB / 5% 2x5MB', source: text(data.source || 'local', 'Source', 100), origin: text(data.origin || this.store.config.origin, 'Origin', 200) };
    condition.deployment=process.env.VERCEL_DEPLOYMENT_ID||process.env.VERCEL_URL||'local';condition.source=process.env.VERCEL_GIT_COMMIT_SHA||condition.source;condition.origin=this.store.config.origin;condition.targets={listP95Ms:2000,detailP95Ms:2000,saveP95Ms:3000,integrityErrors:0};
    if (![condition.concurrency, condition.durationSeconds, condition.datasetTarget].every(Number.isSafeInteger) || condition.concurrency < 1 || condition.concurrency > 220 || condition.durationSeconds < 1 || condition.durationSeconds > 900 || condition.datasetTarget < 0 || condition.datasetTarget > 500) throw new AppError(400, 'Invalid test condition.');
    const op = this.store.receiptRef(profile.uid, data.operationId), hash = digest({ condition, members: data.members });
    return this.db.runTransaction(async tx => {
      await this.store.current(tx, profile, ['admin']);
      const prior = (await tx.get(op)).data(); if (prior) { if (prior.digest !== hash) throw new AppError(409, 'Operation changed.'); return prior; }
      const members = [];
      for (const id of data.members) { const user = (await tx.get(this.ref('users', id))).data(); if (!synthetic(user) || user.status !== 'active') throw new AppError(400, 'Only registered synthetic fixture accounts may participate.'); if (user.testRunId) { const old = (await tx.get(this.ref('testRuns', user.testRunId))).data(); if (old?.status === 'active') throw new AppError(409, 'Account already belongs to an active test run.'); } members.push(user); }
      const id = randomUUID(), createdAt = new Date().toISOString();
      tx.create(this.ref('testRuns', id), { id, status: 'active', condition, members: data.members, createdAt, createdBy: profile.uid });
      for (const user of members) tx.update(this.ref('users', user.uid), { testAccount: true, testRunId: id });
      const receipt = { status: 'committed', kind: 'test-run', runId: id, digest: hash }; tx.create(op, receipt); return receipt;
    });
  }
  async list(profile, after = '') { await this.admin(profile); let q = this.db.collection('testRuns').orderBy('__name__'); if (after) q = q.startAfter(identifier(after)); const docs = (await q.limit(21).get()).docs; return { items: docs.slice(0,20).map(d=>d.data()), nextCursor: docs.length > 20 ? docs[19].id : null }; }
  async close(profile, id, data) {
    await this.admin(profile); const ref = this.ref('testRuns', id), op = this.store.receiptRef(profile.uid, data.operationId), hash = digest({ close: id });
    return this.db.runTransaction(async tx => { await this.store.current(tx, profile, ['admin']); const prior = (await tx.get(op)).data(), run = (await tx.get(ref)).data(); if (prior) { if (prior.digest !== hash) throw new AppError(409, 'Operation changed.'); return prior; } if (!run) throw new AppError(404, 'Test run not found.'); if (run.status === 'active') tx.update(ref, { status: 'closed', closedAt: new Date().toISOString() }); const receipt={status:'committed',runId:id,digest:hash};tx.create(op,receipt);return receipt; });
  }
  async results(profile,id,data){
    await this.admin(profile);if(!['passed','latency-failed','stopped'].includes(data.state)||!Number.isInteger(data.completed)||data.completed<0||data.completed>220||!Number.isFinite(data.elapsedMs)||data.elapsedMs<0||data.elapsedMs>86400000)throw new AppError(400,'Invalid aggregate test result.');
    const allowed=['GET submissions','GET submissions/:id','GET submissions/:id/remarks','GET me','POST submissions','POST submissions/:id/edits','POST upload-sessions','POST auth/session','POST auth/signin','POST submissions/:id/lock','POST submissions/:id/unlock','POST submissions/:id/remarks','PUT drive-transfer','BROWSER browser/list-usable','BROWSER browser/detail-usable','WORKFLOW workflow/save-ack','WORKFLOW workflow/save-metadata','WORKFLOW workflow/save-verified'];
    const metrics={};for(const key of allowed)if(data.groups?.[key]){const value=data.groups[key];metrics[key]={};for(const field of ['count','success','failures','p50','p95','max']){const n=value[field];if(n!==null&&(!Number.isFinite(n)||n<0||n>86400000))throw new AppError(400,'Invalid result metric.');metrics[key][field]=n;}}
    const result={state:data.state,smoke:data.smoke===true,completed:data.completed,elapsedMs:data.elapsedMs,peakRequests:Number(data.actualPeakRequests||0),peakTransfers:data.actualPeakTransfers==null?null:Number(data.actualPeakTransfers),metrics};if(![result.peakRequests,result.peakTransfers].every(n=>n===null||Number.isInteger(n)&&n>=0&&n<=10000))throw new AppError(400,'Invalid peak concurrency.');
    const op=this.store.receiptRef(profile.uid,data.operationId),hash=digest({id,result});return this.db.runTransaction(async tx=>{await this.store.current(tx,profile,['admin']);const prior=(await tx.get(op)).data(),ref=this.ref('testRuns',id),run=(await tx.get(ref)).data();if(prior){if(prior.digest!==hash)throw new AppError(409,'Operation changed.');return prior;}if(!run)throw new AppError(404,'Test run not found.');if(run.result)throw new AppError(409,'A final result is already recorded; create a new run for another measurement.');tx.update(ref,{status:'closed',closedAt:run.closedAt||new Date().toISOString(),result});const receipt={status:'committed',runId:id,digest:hash};tx.create(op,receipt);return receipt;});
  }
  async inventory(profile, id, after = '', submissionId = null, uploads = false) {
    await this.admin(profile); const run=(await this.ref('testRuns',id).get()).data(); if(!run) throw new AppError(404,'Test run not found.');
    let q=this.db.collection(uploads?'uploads':'submissions').where('testRunId','==',id).orderBy('__name__'); if(after) q=q.startAfter(identifier(after));
    if(uploads){const docs=(await q.limit(21).get()).docs;return {run,items:docs.slice(0,20).map(d=>d.data()).filter(u=>!submissionId||u.submissionId===submissionId),nextCursor:docs.length>20?docs[19].id:null};}
    const docs=submissionId ? [await this.ref('submissions',submissionId).get()].filter(d=>d.data()) : (await q.limit(21).get()).docs;
    const items=docs.slice(0,20).map(d=>d.data()).map(item=>({id:item.id,displayId:item.displayId,title:item.title,files:item.media.length,bytes:item.media.reduce((n,f)=>n+f.size,0),eligible:item.testRunId===id&&run.members.includes(item.ownerUid)&&item.displayId!=='PP039'}));
    const {AggregateField}=await import('firebase-admin/firestore');const uploadsQuery=this.db.collection('uploads').where('testRunId','==',id);const totals=(await uploadsQuery.aggregate({files:AggregateField.sum('fileCount'),bytes:AggregateField.sum('totalBytes')}).get()).data();const submissions=(await this.db.collection('submissions').where('testRunId','==',id).count().get()).data().count;
    return {run,totals:{...totals,submissions},items,nextCursor:!submissionId&&docs.length>20?docs[19].id:null, note:'Only trusted marked data is eligible. Files move to Drive Trash. Accounts and reports remain.'};
  }
  async start(profile, data) {
    await this.admin(profile); if(data.confirmation!=='DELETE TEST DATA') throw new AppError(400,'Type DELETE TEST DATA.');
    const ids=data.runIds; if(!Array.isArray(ids)||!ids.length||ids.length>200)throw new AppError(400,'Select 1–200 runs.'); ids.forEach(id=>identifier(id));
    const op=this.store.receiptRef(profile.uid,data.operationId),hash=digest({ids,submissionId:data.submissionId||null});
    return this.db.runTransaction(async tx=>{await this.store.current(tx,profile,['admin']);const prior=(await tx.get(op)).data();if(prior){if(prior.digest!==hash)throw new AppError(409,'Operation changed.');return prior;}
      const runs=[];for(const id of ids){const run=(await tx.get(this.ref('testRuns',id))).data();if(!run)throw new AppError(404,'Test run not found.');runs.push(run);}
      if(data.submissionId){if(ids.length!==1)throw new AppError(400,'Individual cleanup needs one run.'); const item=(await tx.get(this.ref('submissions',identifier(data.submissionId)))).data();if(!item||item.testRunId!==ids[0]||item.displayId==='PP039'||!runs[0].members.includes(item.ownerUid))throw new AppError(403,'Submission is not eligible test data.');}
      const jobId=randomUUID(); for(const run of runs)if(run.status==='active')tx.update(this.ref('testRuns',run.id),{status:'closed',closedAt:new Date().toISOString()});
      tx.create(this.ref('testCleanupJobs',jobId),{id:jobId,runIds:ids,submissionId:data.submissionId||null,runIndex:0,phase:'uploads',cursor:'',status:'pending',deleted:0,trashed:0,createdAt:new Date().toISOString()});const receipt={status:'committed',jobId,digest:hash};tx.create(op,receipt);return receipt;
    });
  }
  async status(profile,id,lean=false,authorized=false){if(!authorized)await this.admin(profile);const job=(await this.ref('testCleanupJobs',id).get()).data();if(!job)throw new AppError(404,'Cleanup job not found.');if(lean)return {job,countsDeferred:true};const q=this.db.collection('testCleanupFiles').where('jobId','==',id);const total=(await q.count().get()).data().count,remaining=(await q.where('status','==','pending').count().get()).data().count;return {job:{...job,files:total,filesRemaining:remaining,filesResolved:total-remaining},remainingFiles:(await q.where('status','==','pending').limit(20).get()).docs.map(d=>({fileId:d.data().fileId,name:d.data().name,runId:d.data().runId}))};}
  async step(profile,id,lean=false){
    await this.admin(profile);const ref=this.ref('testCleanupJobs',id),job=(await ref.get()).data();if(!job)throw new AppError(404,'Cleanup job not found.');if(job.status==='done')return this.status(profile,id,lean,true);
    // Concurrent retries are safe: deletion/trash and file-ledger creation are idempotent.
    const runId=job.runIds[job.runIndex],run=(await this.ref('testRuns',runId).get()).data();if(!run||run.status==='active')throw new AppError(409,'Close the run before cleanup.');
    const lease=randomUUID(); const acquired=await this.db.runTransaction(async tx=>{const fresh=(await tx.get(ref)).data();if(fresh.leaseUntil>Date.now())return false;tx.update(ref,{lease,leaseUntil:Date.now()+120000,status:"pending",message:"Cleanup in progress."});return true;});if(!acquired)return this.status(profile,id,lean,true);
    try{
      if(job.phase==='uploads'){
        let q=this.db.collection('uploads').where('testRunId','==',runId).orderBy('__name__');if(job.cursor)q=q.startAfter(job.cursor);const docs=(await q.limit(20).get()).docs;
        for(const doc of docs){const upload=doc.data();if(!run.members.includes(upload.ownerUid)|| (job.submissionId&&upload.submissionId!==job.submissionId))continue;
          for(const file of upload.files)await this.ref('testCleanupFiles',digest([id,file.id])).set({jobId:id,runId,fileId:file.id,name:file.name,size:file.size,submissionId:upload.submissionId,ownerUid:upload.ownerUid,uploadId:upload.id,uploadStatus:upload.status,sessionExpiresAt:upload.status==='consumed'?0:(upload.driveSessionExpiresAt||upload.expiresAt+7*86400000+3600000),status:'pending'});
        }
        await ref.update(docs.length===20?{cursor:docs.at(-1).id}:{phase:'submissions',cursor:''});
      }else if(job.phase==='submissions'){
        const docs=job.submissionId?[await this.ref('submissions',job.submissionId).get()].filter(d=>d.data()):(await this.db.collection('submissions').where('testRunId','==',runId).limit(10).get()).docs;
        for(const doc of docs){const item=doc.data();if(item.displayId==='PP039'||item.testRunId!==runId||!run.members.includes(item.ownerUid))throw new AppError(409,'Protected or mismatched record excluded.');
          const notes=(await this.db.collection('remarks').where('submissionId','==',item.id).limit(20).get()).docs;for(const note of notes){if(note.data().testRunId!==runId)throw new AppError(409,'Unmarked remark excluded.');await note.ref.delete();}if(notes.length===20)continue;
          await this.db.runTransaction(async tx=>{const fresh=(await tx.get(doc.ref)).data(),freshRun=(await tx.get(this.ref('testRuns',runId))).data(),progress=(await tx.get(ref)).data();if(!fresh)return;if(freshRun.status==='active'||fresh.testRunId!==runId||fresh.displayId==='PP039'||!freshRun.members.includes(fresh.ownerUid))throw new AppError(409,'Cleanup eligibility changed.');tx.delete(doc.ref);tx.update(ref,{deleted:(progress.deleted||0)+1});});
        }
        if(!docs.length)await ref.update({phase:'files',cursor:''});
      }else if(job.phase==='files'){
        const docs=(await this.db.collection('testCleanupFiles').where('jobId','==',id).where('status','==','pending').limit(10).get()).docs;
        for(const doc of docs){const file=doc.data();
          const original=(await this.ref('submissions',file.submissionId).get()).data(), references=(await this.db.collection('submissions').where('mediaIds','array-contains',file.fileId).limit(1).get()).docs;
          if(original?.media.some(f=>f.id===file.fileId)||references.length)throw new AppError(409,'File remains referenced; it was protected.');
          let actual;try{actual=await this.store.drive.metadata(file.fileId);}catch(error){if(error.status!==404)throw error;}
          const deadline=file.sessionExpiresAt??(file.expiresAt?file.expiresAt+7*86400000+3600000:0);
          if(!actual&&deadline>Date.now()){await ref.update({status:'waiting',message:'Transfer is unresolved. Drive sessions can last one week; completion remains pending until the provider-session deadline.',retryAfter:new Date(deadline).toISOString()});return this.status(profile,id,lean,true);}
          if(actual&&!actual.trashed&&file.size!=null&&Number(actual.size)!==file.size)throw new AppError(409,'Drive file size changed or transfer is incomplete; file protected for review.');
          if(actual){const p=actual.appProperties||{};if((!actual.trashed&&!actual.parents?.includes(this.store.config.folderId))||p.prototype!=='ppcp-m04'||p.testRunId!==file.runId||p.ownerUid!==file.ownerUid||p.submissionId!==file.submissionId||p.uploadId!==file.uploadId)throw new AppError(409,'Drive file ownership/run mismatch.');if(!actual.trashed)await this.store.drive.trash(file.fileId);}
          await doc.ref.update({status:'done'});
        }
        if(!docs.length){if(job.runIndex+1<job.runIds.length)await ref.update({runIndex:job.runIndex+1,phase:'uploads',cursor:'',status:'pending'});else await ref.update({phase:'verify',status:'pending'});}
      }else if(job.phase==='verify'){
        const remaining=(await this.db.collection('testCleanupFiles').where('jobId','==',id).where('status','==','pending').limit(1).get()).docs;if(remaining.length)throw new AppError(409,'Files remain pending.');
        for(const rid of job.runIds){const remainingItems=job.submissionId?(await this.ref('submissions',job.submissionId).get()).data():(await this.db.collection('submissions').where('testRunId','==',rid).limit(1).get()).docs.length;if(remainingItems)throw new AppError(409,'Eligible submissions remain.');}
        await ref.update({status:'done',completedAt:new Date().toISOString(),message:'Selected marked submissions/remarks deleted; file cleanup verified. Accounts and reports retained.'});
      }
    }catch(error){await ref.update({status:'retry-required',message:error instanceof AppError?error.message:'Provider operation failed. Retry this job.'});}
    finally{await this.db.runTransaction(async tx=>{const fresh=(await tx.get(ref)).data();if(fresh?.lease===lease)tx.update(ref,{leaseUntil:0});});}
    return this.status(profile,id,lean,true);
  }
}


