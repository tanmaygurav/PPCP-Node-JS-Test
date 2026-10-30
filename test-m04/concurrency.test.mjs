import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as turn, setTimeout as delay} from 'node:timers/promises';
import {orderedPool} from '../src/m04/concurrency.mjs';
import {M04Drive} from '../src/m04/drive.mjs';

test('ordered workers keep input order despite reversed completion', async()=>{
 const gates=[],started=[];
 const pending=orderedPool([0,1,2,3],3,async value=>{started.push(value);await new Promise(resolve=>gates[value]=resolve);return value;});
 await turn();assert.deepEqual(started,[0,1,2]);gates[2]();await turn();assert.deepEqual(started,[0,1,2,3]);gates[3]();gates[1]();gates[0]();assert.deepEqual(await pending,[0,1,2,3]);
});
test('first/middle failures stop queued work and drain started work before rejecting',async()=>{
 for(const failedIndex of [0,1]){
  const gates=[],started=[];let settled=false;
  const pending=orderedPool([0,1,2,3,4,5],3,async index=>{started.push(index);await new Promise((resolve,reject)=>gates[index]={resolve,reject});return index;}).then(()=>{throw Error('Unexpected success');},error=>{settled=true;return error;});
  await turn();gates[failedIndex].reject(Error('File failed'));await turn();assert.equal(settled,false);assert.deepEqual(started,[0,1,2]);for(const [index,gate]of gates.entries())if(index!==failedIndex)gate.resolve();assert.equal((await pending).message,'File failed');assert.deepEqual(started,[0,1,2]);
 }
});
test('Drive objects share six permits and release them after transport failure',async()=>{
 let active=0,peak=0,started=0;
 const fetcher=async()=>{active++;peak=Math.max(peak,active);const number=started++;try{await delay(5);if(number===2)throw Error('Transport timeout');return new Response(JSON.stringify({id:String(number)}));}finally{active--;}};
 const drives=[new M04Drive({},fetcher),new M04Drive({},fetcher)];for(const drive of drives)drive.accessToken=async()=>'test-token';
 const outcomes=await Promise.allSettled(Array.from({length:24},(_,i)=>drives[i%2].metadata(String(i))));assert.equal(peak,6);assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);assert.equal(active,0);assert.ok(await drives[0].metadata('after-failure'));
});
