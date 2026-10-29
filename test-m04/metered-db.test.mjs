import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { MemoryDB } from './memory.mjs';
import { meteredDB } from '../src/m04/metered-db.mjs';
import { withTelemetry,timingHeaders } from '../src/m04/telemetry.mjs';
test('metered SDK references work in transactions and expose counts without content',async t=>{
  const raw=process.env.FIRESTORE_EMULATOR_HOST?new Firestore({projectId:'demo-ppcp-m04',databaseId:'meter-'+randomUUID()}):new MemoryDB();if(raw.terminate)t.after(()=>raw.terminate());const db=meteredDB(raw),headers={},res={setHeader:(k,v)=>headers[k]=v,getHeader:k=>headers[k],statusCode:200};
  await withTelemetry({url:'/api/submissions',method:'POST',headers:{}},res,async()=>{const ref=db.collection('rows').doc('record');await ref.set({secretContent:'must not be logged',value:1});await db.runTransaction(async tx=>{const old=(await tx.get(ref)).data();tx.update(ref,{value:old.value+1});});const docs=(await db.collection('rows').where('value','==',2).get()).docs;assert.equal(docs.length,1);await docs[0].ref.delete();timingHeaders(res);});
  const counts=JSON.parse(headers['X-M04-Observed-Ops']);assert(counts.reads>=2);assert(counts.writes>=2);assert.equal(counts.deletes,1);assert(counts.transactionAttempts>=1);assert(!JSON.stringify(headers).includes('must not be logged'));
});
