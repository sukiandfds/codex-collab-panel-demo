import type { SessionDetail, SessionSummary } from "../model/types";

const storageKey = "negus-conversation-snapshot-v1";
const legacyStorageKey = "codex-collab-conversation-snapshot-v1";
const maxSnapshotCharacters = 1024 * 1024;
const maxCachedConversations = 5;
const maxCachedMessages = 60;

export interface CachedConversation {
  savedAt: string;
  isPartial?: boolean;
  session: SessionDetail;
}

export interface ConversationSnapshot {
  version: 1;
  savedAt: string;
  isPartial?: boolean;
  selectedId: string;
  sessions: SessionSummary[];
  session: SessionDetail | null;
  recentSessions?: CachedConversation[];
}

const isSessionDetail = (value: unknown): value is SessionDetail => Boolean(
  value
  && typeof value === "object"
  && typeof (value as SessionDetail).threadId === "string"
  && Array.isArray((value as SessionDetail).messages),
);

const validSnapshot = (value: ConversationSnapshot | null): ConversationSnapshot | null => {
  if (!value || value.version !== 1 || !Array.isArray(value.sessions)) return null;
  if (value.session && !isSessionDetail(value.session)) return null;
  if (value.session && value.session.threadId !== value.selectedId) return null;
  const recentSessions = Array.isArray(value.recentSessions)
    ? value.recentSessions.filter((entry) => Boolean(
      entry
      && typeof entry.savedAt === "string"
      && isSessionDetail(entry.session)
      && entry.session.threadId !== value.selectedId,
    )).slice(0, maxCachedConversations - 1)
    : [];
  return { ...value, recentSessions };
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

export const writeConversationSnapshot = ({ selectedId, sessions, session }: {
  selectedId: string;
  sessions: SessionSummary[];
  session: SessionDetail | null;
}) => {
  try {
    const previous = readConversationSnapshot();
    const savedAt = new Date().toISOString();
    const cachedMessageCount = session?.threadId === selectedId ? session.messages.length : 0;
    const cachedSession = session && session.threadId === selectedId
      ? { ...session, messages: session.messages.slice(-maxCachedMessages) }
      : null;
    const previousEntries: CachedConversation[] = [
      ...(previous?.session ? [{
        savedAt: previous.savedAt,
        isPartial: previous.isPartial,
        session: previous.session,
      }] : []),
      ...(previous?.recentSessions || []),
    ];
    const selectedPrevious = previousEntries.find((entry) => entry.session.threadId === selectedId);
    const seen = new Set<string>();
    const recentSessions = previousEntries.filter((entry) => {
      const threadId = entry.session.threadId;
      if (threadId === selectedId || seen.has(threadId)) return false;
      seen.add(threadId);
      return true;
    }).slice(0, maxCachedConversations - 1);
    const snapshot: ConversationSnapshot = {
      version: 1,
      savedAt,
      isPartial: Boolean(selectedPrevious?.isPartial || (cachedSession && cachedMessageCount > cachedSession.messages.length)),
      selectedId,
      sessions: sessions.slice(0, 50),
      session: cachedSession,
      recentSessions,
    };
    let serialized = JSON.stringify(snapshot);
    while (serialized.length > maxSnapshotCharacters && snapshot.recentSessions?.length) {
      const oldest = snapshot.recentSessions[snapshot.recentSessions.length - 1];
      if (oldest.session.messages.length <= 1) {
        snapshot.recentSessions.pop();
      } else {
        oldest.isPartial = true;
        oldest.session = {
          ...oldest.session,
          messages: oldest.session.messages.slice(Math.ceil(oldest.session.messages.length / 2)),
        };
      }
      serialized = JSON.stringify(snapshot);
    }
    while (serialized.length > maxSnapshotCharacters && snapshot.session && snapshot.session.messages.length > 1) {
      snapshot.isPartial = true;
      snapshot.session.messages = snapshot.session.messages.slice(Math.ceil(snapshot.session.messages.length / 4));
      serialized = JSON.stringify(snapshot);
    }
    if (serialized.length <= maxSnapshotCharacters) window.localStorage.setItem(storageKey, serialized);
  } catch {}
};
