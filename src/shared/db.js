// Minimal IndexedDB key/value store. Needed because FileSystemHandles can only be
// persisted in IndexedDB (not chrome.storage).
const DB_NAME = 'markcraft';
const STORES = ['handles', 'recent', 'comments', 'bindings'];
let dbp;

function open() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const db = {
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  set: (store, key, value) => tx(store, 'readwrite', (s) => s.put(value, key)),
  del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Recent documents shown in the popup and welcome screen.
export async function addRecent(entry) {
  await db.set('recent', entry.key, { ...entry, time: Date.now() });
  const all = (await db.all('recent')).sort((a, b) => b.time - a.time);
  for (const old of all.slice(30)) await db.del('recent', old.key);
}

export async function getRecent() {
  return (await db.all('recent')).sort((a, b) => b.time - a.time);
}

// Save a FileSystemHandle, reusing the id of an identical stored handle.
export async function storeHandle(handle, extra = {}) {
  const all = await tx('handles', 'readonly', (s) => s.getAllKeys());
  for (const id of all) {
    const rec = await db.get('handles', id);
    if (rec?.handle && rec.handle.kind === handle.kind && (await rec.handle.isSameEntry(handle).catch(() => false))) return id;
  }
  const id = uid();
  await db.set('handles', id, { handle, name: handle.name, ...extra });
  return id;
}
