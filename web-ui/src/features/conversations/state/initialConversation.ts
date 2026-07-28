import { readConversationSnapshot } from "../data/conversationSnapshot";
import type { SessionDetail, SessionSummary } from "../model/types";

export interface InitialConversationState {
  selectedId: string;
  session: SessionDetail | null;
  sessions: SessionSummary[];
}

export const readInitialConversationState = (): InitialConversationState => {
  const snapshot = readConversationSnapshot();
  const selectedId = new URLSearchParams(window.location.search).get("thread")
    || snapshot?.selectedId
    || "";
  const session = snapshot?.session?.threadId === selectedId ? snapshot.session : null;
  return { selectedId, session, sessions: snapshot?.sessions || [] };
};
