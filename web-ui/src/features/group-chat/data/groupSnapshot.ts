import { groupApi } from "./groupApi";
import type { GroupSnapshot } from "../model/types";

const storageKey = "negus-group-snapshot-v1";
const messageLimit = 80;
const maxBytes = 384 * 1024;

const validSnapshot = (value: GroupSnapshot | null): value is GroupSnapshot => Boolean(
  value?.room?.id
  && Array.isArray(value.messages)
  && Array.isArray(value.agents)
  && Array.isArray(value.members),
);

export const readGroupSnapshot = (): GroupSnapshot | null => {
  try {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) || "null") as GroupSnapshot | null;
    if (!validSnapshot(snapshot)) return null;
    return {
      ...snapshot,
      messages: snapshot.messages.filter((message) => !(message.pending && message.type === "agent")),
      agents: snapshot.agents.map((agent) => ({ ...agent, active: false })),
      members: [],
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
