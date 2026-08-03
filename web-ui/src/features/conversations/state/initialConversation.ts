import { readConversationSnapshot } from "../data/conversationSnapshot";
import type { SessionDetail, SessionSummary } from "../model/types";

export interface InitialConversationState {
  selectedId: string;
  session: SessionDetail | null;
  sessions: SessionSummary[];
}

export const readInitialConversationState = (): InitialConversationState => {
  const snapshot = readConversationSnapshot();
  const params = new URLSearchParams(window.location.search);
  const archivedView = params.get("archived") === "1";
  const selectedId = archivedView ? "" : params.get("thread")
    || snapshot?.selectedId
    || "";
  const session = !archivedView && snapshot?.session?.threadId === selectedId ? snapshot.session : null;
  return { selectedId, session, sessions: snapshot?.sessions || [] };
};
