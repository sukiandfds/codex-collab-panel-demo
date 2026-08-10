import { groupApi } from "./groupApi";
import { keepUnacknowledgedMessages, upsertGroupMessage } from "./groupMessageState";
import type { GroupMessage, GroupSnapshot } from "../model/types";

const storageKey = "negus-group-snapshot-v1";
const messageLimit = 80;
const maxBytes = 384 * 1024;

const validSnapshot = (value: GroupSnapshot | null): value is GroupSnapshot => Boolean(
  value?.room?.id
  && Array.isArray(value.messages)
  && Array.isArray(value.agents)
  && Array.isArray(value.members),
);

const pendingMessageFromWork = (work: NonNullable<GroupSnapshot["activeWorks"]>[number]): GroupMessage => ({
  id: `pending-${work.workId}`,
  workId: work.workId,
  pending: true,
  type: "agent",
  authorId: work.agentId,
  authorName: work.agentName,
  agentId: work.agentId,
  mode: work.mode,
  text: "",
  attachments: [],
  artifactIds: [],
  createdAt: work.startedAt,
});

export const restoreActiveGroupWorks = (snapshot: GroupSnapshot): GroupSnapshot => ({
  ...snapshot,
  activeWorks: snapshot.activeWorks || [],
  messages: (snapshot.activeWorks || []).reduce(
    (messages, work) => messages.some((message) => message.workId === work.workId)
      ? messages
      : upsertGroupMessage(messages, pendingMessageFromWork(work)),
    snapshot.messages.filter((message) => !(message.pending && message.type === "agent")),
  ),
});

export const reconcileGroupSnapshot = (
  incoming: GroupSnapshot,
  current: GroupSnapshot | null,
  pendingMessages: GroupMessage[] = [],
): GroupSnapshot => {
  const messages = keepUnacknowledgedMessages(incoming.messages, [
    ...(current?.messages.filter((message) => !(message.pending && message.type === "agent")) || []),
    ...pendingMessages,
  ]);
  const completedWorkIds = new Set(messages
    .filter((message) => !message.pending && message.workId)
    .map((message) => message.workId));
  return restoreActiveGroupWorks({
    ...incoming,
    messages,
    activeWorks: (incoming.activeWorks || []).filter((work) => !completedWorkIds.has(work.workId)),
  });
};

export const readGroupSnapshot = (): GroupSnapshot | null => {
  try {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) || "null") as GroupSnapshot | null;
    if (!validSnapshot(snapshot)) return null;
    return {
      ...snapshot,
      messages: snapshot.messages.filter((message) => !(message.pending && message.type === "agent")),
      agents: snapshot.agents.map((agent) => ({ ...agent, active: false })),
      members: [],
      activeWorks: [],
    };
  } catch {
    return null;
  }
};

export const writeGroupSnapshot = (snapshot: GroupSnapshot) => {
  try {
    const cached: GroupSnapshot = {
      ...snapshot,
      messages: snapshot.messages
        .filter((message) => !(message.pending && message.type === "agent"))
        .slice(-messageLimit),
      activeWorks: [],
    };
    const serialized = JSON.stringify(cached);
    if (serialized.length <= maxBytes) window.localStorage.setItem(storageKey, serialized);
  } catch {
    // Storage may be unavailable in private or restricted mobile browsers.
  }
};

let prefetch: Promise<void> | null = null;
export const prefetchGroupSnapshot = () => {
  if (!prefetch) {
    prefetch = groupApi.snapshot()
      .then(writeGroupSnapshot)
      .catch(() => {})
      .finally(() => { prefetch = null; });
  }
  return prefetch;
};
