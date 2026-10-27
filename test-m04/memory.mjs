// Offline transactional adapter. The same behavior suite also runs against the
// real Firestore emulator; this adapter is not capacity/index evidence.
export class MemoryDB {
  constructor() { this.rows = new Map(); this.tail = Promise.resolve(); }
  collection(name) {
    return { doc: (id = crypto.randomUUID()) => this.reference(`${name}/${id}`) };
  }
  reference(path) {
    const ref = { path, id: path.split('/')[1], get: async () => ({ data: () => structuredClone(this.rows.get(path)), ref }), set: async data => this.rows.set(path, structuredClone(data)), update: async data => this.rows.set(path, { ...this.rows.get(path), ...structuredClone(data) }) }; return ref;
  }
  async runTransaction(callback) {
    const previous = this.tail; let release; this.tail = new Promise(resolve => { release = resolve; }); await previous;
    const changes = []; let wrote = false;
    const tx = { get: async ref => { if (wrote) throw new Error('Firestore reads must precede writes.'); return ref.get(); }, create: (ref, data) => { wrote = true; if (this.rows.has(ref.path)) throw new Error('Already exists'); changes.push([ref.path, data]); }, set: (ref, data) => { wrote = true; changes.push([ref.path, data]); }, update: (ref, data) => { wrote = true; changes.push([ref.path, { ...this.rows.get(ref.path), ...data }]); } };
    try { const result = await callback(tx); for (const [path, data] of changes) this.rows.set(path, structuredClone(data)); return result; } finally { release(); }
  }
}
