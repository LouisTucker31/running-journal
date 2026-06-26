// db.js — IndexedDB data-access layer
// Single source of truth for all persistence. Designed so the rest of the app
// never touches IndexedDB directly: swap this module for a Supabase adapter later
// without changing callers.

const DB_NAME = 'running-journal';
const DB_VERSION = 1;

const STORES = {
  runs: 'runs',
  shoes: 'shoes',
  templates: 'templates',
  goals: 'goals',
  settings: 'settings',
};

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.runs)) {
        const s = db.createObjectStore(STORES.runs, { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.shoes)) {
        db.createObjectStore(STORES.shoes, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.templates)) {
        db.createObjectStore(STORES.templates, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.goals)) {
        db.createObjectStore(STORES.goals, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Generic CRUD ---------------------------------------------------------------
async function getAll(store) {
  const os = await tx(store);
  return promisify(os.getAll());
}

async function get(store, id) {
  const os = await tx(store);
  return promisify(os.get(id));
}

async function put(store, record) {
  if (!record.id && store !== STORES.settings) record.id = uid();
  const os = await tx(store, 'readwrite');
  await promisify(os.put(record));
  return record;
}

async function remove(store, id) {
  const os = await tx(store, 'readwrite');
  return promisify(os.delete(id));
}

async function clear(store) {
  const os = await tx(store, 'readwrite');
  return promisify(os.clear());
}

// Domain helpers -------------------------------------------------------------
const DB = {
  STORES,
  uid,

  // Runs
  getRuns: () => getAll(STORES.runs),
  getRun: (id) => get(STORES.runs, id),
  saveRun: (run) => put(STORES.runs, run),
  deleteRun: (id) => remove(STORES.runs, id),

  // Shoes
  getShoes: () => getAll(STORES.shoes),
  getShoe: (id) => get(STORES.shoes, id),
  saveShoe: (shoe) => put(STORES.shoes, shoe),
  deleteShoe: (id) => remove(STORES.shoes, id),

  // Templates
  getTemplates: () => getAll(STORES.templates),
  saveTemplate: (t) => put(STORES.templates, t),
  deleteTemplate: (id) => remove(STORES.templates, id),

  // Goals
  getGoals: () => getAll(STORES.goals),
  saveGoal: (g) => put(STORES.goals, g),
  deleteGoal: (id) => remove(STORES.goals, id),

  // Settings (key/value)
  async getSetting(key, fallback = null) {
    const rec = await get(STORES.settings, key);
    return rec ? rec.value : fallback;
  },
  setSetting: (key, value) => put(STORES.settings, { key, value }),

  // Backup / restore
  async exportAll() {
    const [runs, shoes, templates, goals] = await Promise.all([
      getAll(STORES.runs), getAll(STORES.shoes),
      getAll(STORES.templates), getAll(STORES.goals),
    ]);
    const settings = await getAll(STORES.settings);
    return { version: DB_VERSION, exportedAt: new Date().toISOString(),
      runs, shoes, templates, goals, settings };
  },

  async importAll(data, { merge = false } = {}) {
    if (!merge) {
      await Promise.all([clear(STORES.runs), clear(STORES.shoes),
        clear(STORES.templates), clear(STORES.goals), clear(STORES.settings)]);
    }
    for (const r of data.runs || []) await put(STORES.runs, r);
    for (const s of data.shoes || []) await put(STORES.shoes, s);
    for (const t of data.templates || []) await put(STORES.templates, t);
    for (const g of data.goals || []) await put(STORES.goals, g);
    for (const s of data.settings || []) await put(STORES.settings, s);
  },

  async seedDefaults() {
    const seeded = await this.getSetting('_seeded');
    if (seeded) return;
    const defaults = [
      { name: 'Easy Run', type: 'easy', color: '#5e9bff' },
      { name: 'Long Run', type: 'long', color: '#a98bff' },
      { name: 'Threshold', type: 'threshold', color: '#ff9f5e' },
      { name: 'Tempo', type: 'tempo', color: '#ffd95e' },
      { name: 'Intervals', type: 'intervals', color: '#ff6b81' },
      { name: 'Recovery', type: 'recovery', color: '#5ee0c8' },
      { name: 'Race', type: 'race', color: '#ff5e7a' },
    ];
    for (const d of defaults) await put(STORES.templates, { id: uid(), ...d });
    await this.setSetting('_seeded', true);
  },
};

window.DB = DB;
