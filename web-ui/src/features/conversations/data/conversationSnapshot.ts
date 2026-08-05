import type { SessionDetail, SessionSummary } from "../model/types";

const storageKey = "negus-conversation-snapshot-v1";
const legacyStorageKey = "codex-collab-conversation-snapshot-v1";
const maxSnapshotBytes = 768 * 1024;
const maxBootstrapBytes = 64 * 1024;
const bootstrapMessageLimit = 8;
const databaseName = "negus-conversations";
const legacyDatabaseName = "codex-collab-conversations";
const databaseVersion = 1;
const objectStoreName = "snapshots";
const objectKey = "current";
let indexedWriteQueue = Promise.resolve();

export interface ConversationSnapshot {
  version: 1;
  savedAt: string;
  selectedId: string;
  sessions: SessionSummary[];
  session: SessionDetail | null;
}

const validSnapshot = (value: ConversationSnapshot | null): ConversationSnapshot | null => {
  if (!value || value.version !== 1 || !Array.isArray(value.sessions)) return null;
  if (value.session && value.session.threadId !== value.selectedId) return null;
  return value;
};

const selectNewestSnapshot = (...snapshots: Array<ConversationSnapshot | null>) => snapshots.reduce<ConversationSnapshot | null>(
  (best, current) => {
    if (!current) return best;
    if (!best) return current;
    const currentAt = Date.parse(current.savedAt) || 0;
    const bestAt = Date.parse(best.savedAt) || 0;
    if (currentAt !== bestAt) return currentAt > bestAt ? current : best;
    return (current.session?.messages.length || 0) >= (best.session?.messages.length || 0) ? current : best;
  },
  null,
);

const readLocalSnapshot = (key: string) => {
  try {
    return validSnapshot(JSON.parse(window.localStorage.getItem(key) || "null") as ConversationSnapshot | null);
  } catch {
    return null;
  }
};

export const readConversationSnapshot = (): ConversationSnapshot | null => selectNewestSnapshot(
  readLocalSnapshot(storageKey),
  readLocalSnapshot(legacyStorageKey),
);

const openSnapshotDatabase = (name: string) => new Promise<IDBDatabase | null>((resolve, reject) => {
  if (typeof window === "undefined" || !window.indexedDB) {
    resolve(null);
    return;
  }
  const request = window.indexedDB.open(name, databaseVersion);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(objectStoreName)) database.createObjectStore(objectStoreName);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
});

const readIndexedSnapshotFrom = async (name: string): Promise<ConversationSnapshot | null> => {
  const database = await openSnapshotDatabase(name);
  if (!database) return null;
  try {
    return await new Promise<ConversationSnapshot | null>((resolve, reject) => {
      const request = database.transaction(objectStoreName, "readonly").objectStore(objectStoreName).get(objectKey);
      request.onsuccess = () => resolve(validSnapshot(request.result as ConversationSnapshot | null));
      request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
    });
  } finally {
    database.close();
  }
};

const readIndexedSnapshot = async (): Promise<ConversationSnapshot | null> => {
  const [current, legacy] = await Promise.all([
    readIndexedSnapshotFrom(databaseName).catch(() => null),
    readIndexedSnapshotFrom(legacyDatabaseName).catch(() => null),
  ]);
  return selectNewestSnapshot(current, legacy);
};

const writeIndexedSnapshot = async (snapshot: ConversationSnapshot) => {
  const database = await openSnapshotDatabase(databaseName);
  if (!database) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, "readwrite");
      transaction.objectStore(objectStoreName).put(snapshot, objectKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB write failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB write aborted"));
    });
  } finally {
    database.close();
  }
};

export const readConversationSnapshotAsync = async (): Promise<ConversationSnapshot | null> => {
  const local = readConversationSnapshot();
  try {
    const indexed = await readIndexedSnapshot();
    return selectNewestSnapshot(local, indexed);
  } catch {
    return local;
  }
};

export const writeConversationSnapshot = ({ selectedId, sessions, session }: {
  selectedId: string;
  sessions: SessionSummary[];
  session: SessionDetail | null;
}) => {
  try {
    const cachedSession = session && session.threadId === selectedId
      ? { ...session, messages: session.messages.slice(-60) }
      : null;
    const snapshot: ConversationSnapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      selectedId,
      sessions: sessions.slice(0, 50),
      session: cachedSession,
    };
    let serialized = JSON.stringify(snapshot);
    while (serialized.length > maxSnapshotBytes && snapshot.session && snapshot.session.messages.length > 1) {
      snapshot.session.messages = snapshot.session.messages.slice(Math.ceil(snapshot.session.messages.length / 4));
      serialized = JSON.stringify(snapshot);
    }
    if (serialized.length <= maxSnapshotBytes) {
      let bootstrapSession = snapshot.session
        ? {
          ...snapshot.session,
          contentVersion: undefined,
          messages: snapshot.session.messages.slice(-bootstrapMessageLimit),
        }
        : null;
      let bootstrapSnapshot: ConversationSnapshot = { ...snapshot, session: bootstrapSession };
      let bootstrapSerialized = JSON.stringify(bootstrapSnapshot);
      while (bootstrapSerialized.length > maxBootstrapBytes && bootstrapSession && bootstrapSession.messages.length > 1) {
        bootstrapSession = {
          ...bootstrapSession,
          messages: bootstrapSession.messages.slice(Math.ceil(bootstrapSession.messages.length / 2)),
        };
        bootstrapSnapshot = { ...snapshot, session: bootstrapSession };
        bootstrapSerialized = JSON.stringify(bootstrapSnapshot);
      }
      if (bootstrapSerialized.length <= maxBootstrapBytes) window.localStorage.setItem(storageKey, bootstrapSerialized);
      indexedWriteQueue = indexedWriteQueue
        .catch(() => {})
        .then(() => writeIndexedSnapshot(snapshot));
      void indexedWriteQueue.catch(() => {});
    }
  } catch {}
};
