import type { SessionDetail, SessionSummary } from "../model/types";

const storageKey = "codex-collab-conversation-snapshot-v1";
const maxSnapshotBytes = 768 * 1024;

export interface ConversationSnapshot {
  version: 1;
  savedAt: string;
  selectedId: string;
  sessions: SessionSummary[];
  session: SessionDetail | null;
}

export const readConversationSnapshot = (): ConversationSnapshot | null => {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) || "null") as ConversationSnapshot | null;
    if (value?.version !== 1 || !Array.isArray(value.sessions)) return null;
    if (value.session && value.session.threadId !== value.selectedId) return null;
    return value;
  } catch {
    return null;
  }
};

export const writeConversationSnapshot = ({ selectedId, sessions, session }: {
  selectedId: string;
  sessions: SessionSummary[];
  session: SessionDetail | null;
}) => {
  try {
    const cachedSession = session && session.threadId === selectedId
      ? { ...session, messages: session.messages.filter((message) => !message.id.startsWith("optimistic-")).slice(-60) }
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
    if (serialized.length <= maxSnapshotBytes) window.localStorage.setItem(storageKey, serialized);
  } catch {}
};
