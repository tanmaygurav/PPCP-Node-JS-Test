import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { M04Store } from '../src/m04/store.mjs';
import { MemoryDB } from './memory.mjs';
import { AppError, digest } from '../src/m04/domain.mjs';
async function fixture(){
  const db=process.env.FIRESTORE_EMULATOR_HOST?new Firestore({projectId:'demo-ppcp-m04',databaseId:'test-'+randomUUID()}):new MemoryDB(),objects=new Map();
  const config={secret:'tests'.repeat(8),bootstrapUids:['admin'],folderId:'m04-folder',origin:'http://localhost'};
  let failTrash=false;
  const drive={reserve:async files=>files.map(()=>randomUUID()),start:async(upload,file)=>{objects.set(file.id,{id:file.id,name:file.name,size:file.size,mimeType:file.mimeType,parents:[config.folderId],appProperties:{prototype:'ppcp-m04',testRunId:upload.testRunId,ownerUid:upload.ownerUid,submissionId:upload.submissionId,uploadId:upload.id}});return{...file,uploadUrl:'https://www.googleapis.com/test'};},verify:async file=>{if(!objects.has(file.id))throw new AppError(404,'Missing');return objects.get(file.id);},publish:async file=>({...file,webViewLink:'https://drive.google.com/file/d/'+file.id+'/view'}),metadata:async id=>{if(!objects.has(id))throw new AppError(404,'Missing');return objects.get(id);},trash:async id=>{if(failTrash)throw new Error('Provider unavailable');objects.get(id).trashed=true;}};
  const store=new M04Store(config,db,drive);await store.ref('domains',digest('education')).set({name:'Education',active:true});
  const admin=await store.register({uid:'admin',email:'admin@welingkar.org'},{name:'Admin',program:'Staff',studentId:'A'}),student=await store.register({uid:'m04-poc-1234abcd-s1',email:'m04-poc-1234abcd-s1@welingkar.org'},{name:'Synthetic',program:'Test',studentId:'S'}),real=await store.register({uid:'real',email:'real@welingkar.org'},{name:'Real',program:'PGDM',studentId:'R'});
  const createRun=()=>store.tests.create(admin,{operationId:randomUUID(),name:'Explicit condition',scenario:'mixed',concurrency:1,durationSeconds:180,members:[student.uid]});
  const save=async(profile=student,files=[])=>{const operationId=randomUUID(),upload=await store.prepare(profile,{operationId,files});const result=await store.save(profile,{operationId,uploadId:upload.uploadId,title:'A test title',domain:'Education',description:'Synthetic fixture'});return {result,upload,item:(await store.ref('submissions',result.submissionId).get()).data()};};
  const finish=async id=>{let result;for(let i=0;i<40;i++){result=await store.tests.step(admin,id);if(['done','waiting','retry-required'].includes(result.job.status))break;}return result;};
  return{db,store,admin,student,real,objects,createRun,save,finish,setFail:value=>failTrash=value};
}
test('test metadata is server-controlled, immutable and gates closed-run commits/replays',async t=>{
  const f=await fixture();if(f.db.terminate)t.after(()=>f.db.terminate());const {store,admin,student,real}=f;
  await assert.rejects(store.tests.create(student,{}),{status:403});await assert.rejects(store.tests.create(admin,{operationId:randomUUID(),name:'Wrong',scenario:'mixed',durationSeconds:180,concurrency:1,members:[real.uid]}),{status:400});
  const {runId}=await f.createRun(),saved=await f.save(student,[{name:'fixture.pdf',size:10}]);assert.equal(saved.item.testRunId,runId);assert(saved.item.title.startsWith('[LOAD TEST · '));assert.equal(f.objects.get(saved.item.media[0].id).appProperties.testRunId,runId);
  const forged=await f.save(real);assert.equal(forged.item.testRunId,undefined);
  const op=randomUUID(),prepared=await store.prepare(student,{operationId:op,files:[]});await store.tests.close(admin,runId,{operationId:randomUUID()});
  await assert.rejects(store.save(student,{operationId:op,uploadId:prepared.uploadId,title:'Late',domain:'Education',description:'Should not commit'}),{status:409});await assert.rejects(store.prepare(student,{operationId:randomUUID(),files:[]}),{status:409});
  await assert.rejects(store.mutate(admin,saved.item.id,'remarks',{operationId:randomUUID(),remark:'Late'}),{status:409});
});
test('cleanup retries delete only trusted records/files, preserve real records and never reuse IDs',async t=>{
  const f=await fixture();if(f.db.terminate)t.after(()=>f.db.terminate());const {store,admin,student,real}=f;const {runId}=await f.createRun(),saved=await f.save(student,[{name:'test.pdf',size:10}]),normal=await f.save(real);await store.mutate(admin,saved.item.id,'remarks',{operationId:randomUUID(),remark:'Test review'});
  const operationId=randomUUID(),request={operationId,runIds:[runId],confirmation:'DELETE TEST DATA'};await assert.rejects(store.tests.start(student,request),{status:403});await assert.rejects(store.tests.start(admin,{...request,confirmation:'yes'}),{status:400});
  const job=await store.tests.start(admin,request);assert.equal((await store.tests.start(admin,request)).jobId,job.jobId);f.setFail(true);assert.equal((await f.finish(job.jobId)).job.status,'retry-required');f.setFail(false);assert.equal((await f.finish(job.jobId)).job.status,'done');
  assert.equal((await store.ref('submissions',saved.item.id).get()).data(),undefined);assert((await store.ref('submissions',normal.item.id).get()).data());assert(f.objects.get(saved.item.media[0].id).trashed);assert.equal((await store.db.collection('remarks').where('submissionId','==',saved.item.id).get()).docs.length,0);
  await f.createRun();const next=await f.save();assert(next.item.sequence>normal.item.sequence);assert.equal((await store.tests.step(admin,job.jobId)).job.status,'done');
});
test('cleanup protects PP039 and surviving references; abandoned/late uploads remain pending',async t=>{
  const f=await fixture();if(f.db.terminate)t.after(()=>f.db.terminate());const {store,admin,student}=f;const {runId}=await f.createRun(),saved=await f.save(student,[{name:'test.pdf',size:10}]);
  await store.ref('submissions',saved.item.id).update({displayId:'PP039'});await assert.rejects(store.tests.start(admin,{operationId:randomUUID(),runIds:[runId],submissionId:saved.item.id,confirmation:'DELETE TEST DATA'}),{status:403});await store.ref('submissions',saved.item.id).update({displayId:saved.result.displayId});
  const op=randomUUID(),late=await store.prepare(student,{operationId:op,files:[{name:'late.pdf',size:10}]});
  const job=await store.tests.start(admin,{operationId:randomUUID(),runIds:[runId],confirmation:'DELETE TEST DATA'});assert.equal((await f.finish(job.jobId)).job.status,'waiting');
  const ledgers=(await store.db.collection('testCleanupFiles').where('jobId','==',job.jobId).get()).docs;for(const d of ledgers)await d.ref.update({expiresAt:0});
  await store.ref('submissions','protected-reference').set({id:'protected-reference',mediaIds:[late.uploads[0].id],media:[{id:late.uploads[0].id}]});assert.equal((await f.finish(job.jobId)).job.status,'retry-required');assert(!f.objects.get(late.uploads[0].id).trashed);
  await store.ref('submissions','protected-reference').delete();assert.equal((await f.finish(job.jobId)).job.status,'done');
});
