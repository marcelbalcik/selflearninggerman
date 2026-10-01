/** A tiny key-value store on IndexedDB (logs, checkpoints, the base database). */
const DB = 'wortduell';
const STORE = 'kv';

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
      }),
  );
}

export const idb = {
  get: <T>(key: string) =>
    run<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  set: (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key)),
  del: (key: string) => run('readwrite', (s) => s.delete(key)),
  keys: (prefix: string) =>
    run<IDBValidKey[]>('readonly', (s) =>
      s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)),
    ).then((ks) => ks.map(String)),
};
