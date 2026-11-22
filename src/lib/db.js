// Tiny IndexedDB wrapper shared by the extension recorder and the website.
const DB_NAME = 'atc-predictor';
const VERSION = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tx')) {
        const s = db.createObjectStore('tx', { keyPath: 'id' });
        s.createIndex('ts', 'ts');
        s.createIndex('airport', 'airport');
      }
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  async all() { return run('tx', 'readonly', (s) => reqP(s.getAll())); },
  async put(tx) { return run('tx', 'readwrite', (s) => { s.put(tx); }); },
  async putMany(list) { return run('tx', 'readwrite', (s) => { list.forEach((t) => s.put(t)); }); },
  async remove(ids) {
    await run('tx', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); });
    await run('audio', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); });
  },
  async clear() {
    await run('tx', 'readwrite', (s) => { s.clear(); });
    await run('audio', 'readwrite', (s) => { s.clear(); });
  },
  async putAudio(id, blob) { return run('audio', 'readwrite', (s) => { s.put(blob, id); }); },
  async getAudio(id) { return run('audio', 'readonly', (s) => reqP(s.get(id))); },
  async count() { return run('tx', 'readonly', (s) => reqP(s.count())); },
};

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
