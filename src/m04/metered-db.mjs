import { count } from './telemetry.mjs';
// Meter SDK-visible document operations, not billing. Index-entry reads and
// provider-side retries can add usage; the runner also requires provider headroom.
export function meteredDB(db) {
  function snapshot(value) {
    return new Proxy(value,{get(target,key){if(key==='docs')return target.docs.map(snapshot);if(key==='ref')return wrap(target.ref);const result=Reflect.get(target,key,target);return typeof result==='function'?result.bind(target):result;}});
  }
  function wrap(value) {
    return new Proxy(value,{get(target,key){const member=Reflect.get(target,key,target);if(typeof member!=='function')return member;
      return (...args)=>{
        if(key==='get')return member.apply(target,args).then(result=>{count('reads',result.docs?Math.max(1,result.docs.length):1);return snapshot(result);});
        if(['set','create','update','delete'].includes(key)){count(key==='delete'?'deletes':'writes');return member.apply(target,args);}
        const result=member.apply(target,args);return result&&typeof result==='object'&&!('then'in result)?wrap(result):result;
      };
    }});
  }
  return {collection:name=>wrap(db.collection(name)),runTransaction:work=>{count('transactionExecutions');return db.runTransaction(async tx=>{count('transactionAttempts');const proxy=new Proxy(tx,{get(target,key){if(key==='get')return async ref=>{count('reads');return snapshot(await target.get(ref));};if(['set','create','update','delete'].includes(key))return(...args)=>{count(key==='delete'?'deletes':'writes');target[key](...args);return proxy;};const value=target[key];return typeof value==='function'?value.bind(target):value;}});return work(proxy);});}};
}
