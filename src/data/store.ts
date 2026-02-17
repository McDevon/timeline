import { TimelineEvent } from '../types';

const DB_NAME = 'timeline-data';
const EVENTS_STORE = 'events';
const META_STORE = 'meta';
const EVENTS_KEY = 'all';
const INITIALIZED_KEY = 'initialized';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        db.createObjectStore(EVENTS_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function isStoreInitialized(): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const request = store.get(INITIALIZED_KEY);
      request.onsuccess = () => resolve(request.result === true);
      request.onerror = () => resolve(false);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return false;
  }
}

export async function setStoreInitialized(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      store.put(true, INITIALIZED_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // silently ignore
  }
}

export async function loadStoredEvents(): Promise<TimelineEvent[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(EVENTS_STORE, 'readonly');
      const store = tx.objectStore(EVENTS_STORE);
      const request = store.get(EVENTS_KEY);
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function saveStoredEvents(events: TimelineEvent[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      store.put(events, EVENTS_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // IndexedDB unavailable — silently ignore
  }
}

/** Clear events but keep the initialized flag (for "Delete all events"). */
export async function clearStoredEvents(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      store.clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // silently ignore
  }
}

/** Clear everything — events and initialized flag (for "Reload defaults"). */
export async function clearStore(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([EVENTS_STORE, META_STORE], 'readwrite');
      tx.objectStore(EVENTS_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // silently ignore
  }
}
