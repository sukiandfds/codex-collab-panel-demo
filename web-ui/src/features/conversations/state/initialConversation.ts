import { readConversationSnapshot } from "../data/conversationSnapshot";
import type { SessionDetail, SessionSummary } from "../model/types";

export interface InitialConversationState {
  selectedId: string;
  snapshotSavedAt: string;
  sessionIsPartial: boolean;
  session: SessionDetail | null;
  cachedSessions: SessionDetail[];
  partialSessionIds: string[];
  sessions: SessionSummary[];
}

export const readInitialConversationState = (): InitialConversationState => {
  const snapshot = readConversationSnapshot();
  const params = new URLSearchParams(window.location.search);
  const archivedView = params.get("archived") === "1";
  const selectedId = archivedView ? "" : params.get("thread")
    || snapshot?.selectedId
    || "";
  const cachedEntries = snapshot ? [
    ...(snapshot.session ? [{ session: snapshot.session, isPartial: snapshot.isPartial }] : []),
    ...(snapshot.recentSessions || []),
  ] : [];
  const session = !archivedView
    ? cachedEntries.find((entry) => entry.session.threadId === selectedId)?.session || null
    : null;
  return {
    selectedId,
    snapshotSavedAt: snapshot?.savedAt || "",
    sessionIsPartial: Boolean(cachedEntries.find((entry) => entry.session.threadId === selectedId)?.isPartial),
    session,
    cachedSessions: cachedEntries.map((entry) => entry.session),
    partialSessionIds: cachedEntries.filter((entry) => entry.isPartial).map((entry) => entry.session.threadId),
    sessions: snapshot?.sessions || [],
  };
};
