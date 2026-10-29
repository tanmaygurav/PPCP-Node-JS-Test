// Offline transactional adapter. The same behavior suite also runs against the
// real Firestore emulator; this adapter is not capacity/index evidence.
export class MemoryDB {
  constructor() { this.rows = new Map(); this.tail = Promise.resolve(); }
  collection(name) {
    const build = (filters=[], orders=[], maximum=Infinity, after=null) => ({
      doc: (id = crypto.randomUUID()) => this.reference(name+'/'+id),
      where: (...filter) => build([...filters,filter],orders,maximum,after), orderBy:(...order)=>build(filters,[...orders,order],maximum,after), limit:n=>build(filters,orders,n,after), startAfter:(...values)=>build(filters,orders,maximum,values),
      get: async()=>{let docs=[...this.rows].filter(([path])=>path.startsWith(name+'/')).map(([path,data])=>({id:path.split('/')[1],data:()=>structuredClone(data),ref:this.reference(path)}));
        docs=docs.filter(d=>filters.every(([field,op,value])=>{const actual=field==='__name__'?d.id:d.data()[field];return op==='=='?actual===value:op==='array-contains'?actual?.includes(value):op==='<'?actual<value:op==='>='?actual>=value:op==='<='?actual<=value:false;}));
        const compare=(a,b)=>{for(const [field,direction]of orders){const av=field==='__name__'?a.id:a.data()[field],bv=field==='__name__'?b.id:b.data()[field];if(av!==bv)return (av<bv?-1:1)*(direction==='desc'?-1:1);}return 0;};if(orders.length)docs.sort(compare);
        if(after)docs=docs.filter(d=>compare(d,{id:after[0],data:()=>Object.fromEntries(orders.map(([f],i)=>[f,after[i]]))})>0);docs=docs.slice(0,maximum);return{docs,size:docs.length};},
      count:()=>({get:async()=>({data:()=>({count:[...this.rows].filter(([path,data])=>path.startsWith(name+'/')&&filters.every(([field,op,value])=>op==='=='&&data[field]===value)).length})})})
    });return build();
  }
  reference(path) {
    const ref = { path, id: path.split('/')[1], get: async () => ({ data: () => structuredClone(this.rows.get(path)), ref }), delete: async () => this.rows.delete(path), set: async data => this.rows.set(path, structuredClone(data)), update: async data => this.rows.set(path, { ...this.rows.get(path), ...structuredClone(data) }) }; return ref;
  }
  async runTransaction(callback) {
    const previous = this.tail; let release; this.tail = new Promise(resolve => { release = resolve; }); await previous;
    const changes = []; let wrote = false;
    const tx = { delete: ref => { wrote=true; changes.push([ref.path,undefined]); }, get: async ref => { if (wrote) throw new Error('Firestore reads must precede writes.'); return ref.get(); }, create: (ref, data) => { wrote = true; if (this.rows.has(ref.path)) throw new Error('Already exists'); changes.push([ref.path, data]); }, set: (ref, data) => { wrote = true; changes.push([ref.path, data]); }, update: (ref, data) => { wrote = true; changes.push([ref.path, { ...this.rows.get(ref.path), ...data }]); } };
    try { const result = await callback(tx); for (const [path, data] of changes) data===undefined?this.rows.delete(path):this.rows.set(path, structuredClone(data)); return result; } finally { release(); }
  }
}
