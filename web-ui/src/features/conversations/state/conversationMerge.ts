import type { SessionDelta, SessionDetail, SessionMessage } from "../model/types";

const isOptimisticMessage = (message: SessionMessage) => message.id.startsWith("optimistic-");

const timestampOf = (message: SessionMessage) => {
  const timestamp = Date.parse(message.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const mergeMessageList = (baseMessages: SessionMessage[], incomingMessages: SessionMessage[]) => {
  const merged: SessionMessage[] = [];
  const indexes = new Map<string, number>();

  const addOrReplace = (message: SessionMessage) => {
    const knownIndex = indexes.get(message.id);
    if (knownIndex !== undefined) {
      merged[knownIndex] = message;
      return;
    }

    const timestamp = timestampOf(message);
    const insertAt = timestamp === null
      ? -1
      : merged.findIndex((current) => {
        const currentTimestamp = timestampOf(current);
        return currentTimestamp !== null && currentTimestamp > timestamp;
      });
    const index = insertAt >= 0 ? insertAt : merged.length;
    merged.splice(index, 0, message);
    for (let currentIndex = index; currentIndex < merged.length; currentIndex += 1) {
      indexes.set(merged[currentIndex].id, currentIndex);
    }
  };

  for (const message of baseMessages) addOrReplace(message);
  for (const message of incomingMessages) addOrReplace(message);
  return merged;
};

const attachmentSignature = (message: SessionMessage) => (message.blocks || [])
  .filter((block) => "source" in block)
  .map((block) => `${block.type}:${block.file?.id || block.source}`)
  .sort()
  .join("|");

const persistedMatchesOptimistic = (persisted: SessionMessage, optimistic: SessionMessage) => {
  if (persisted.role !== "user" || isOptimisticMessage(persisted) || persisted.text !== optimistic.text) return false;
  const persistedAttachments = attachmentSignature(persisted);
  const optimisticAttachments = attachmentSignature(optimistic);
  if ((persistedAttachments || optimisticAttachments) && persistedAttachments !== optimisticAttachments) return false;
  if (persisted.turnId && optimistic.turnId) return persisted.turnId === optimistic.turnId;
  const persistedAt = Date.parse(persisted.createdAt || "");
  const optimisticAt = Date.parse(optimistic.createdAt || "");
  return !Number.isFinite(persistedAt)
    || !Number.isFinite(optimisticAt)
    || Math.abs(persistedAt - optimisticAt) <= 5 * 60 * 1000;
};

const unresolvedOptimisticMessages = (incoming: SessionDetail, current: SessionDetail) => {
  const persistedUsers = incoming.messages.filter((message) => message.role === "user" && !isOptimisticMessage(message));
  const consumed = new Set<number>();
  return current.messages.filter(isOptimisticMessage).filter((optimistic) => {
    const match = persistedUsers.findIndex((persisted, index) => (
      !consumed.has(index) && persistedMatchesOptimistic(persisted, optimistic)
    ));
    if (match < 0) return true;
    consumed.add(match);
    return false;
  });
};

export const mergeOlderMessages = (olderMessages: SessionMessage[], currentMessages: SessionMessage[]) => (
  mergeMessageList(olderMessages, currentMessages)
);

export const mergePendingOptimisticMessages = (incoming: SessionDetail, pending: SessionMessage[]) => {
  if (!pending.length) return incoming;
  const incomingIds = new Set(incoming.messages.map((message) => message.id));
  const unresolved = unresolvedOptimisticMessages(incoming, { ...incoming, messages: pending })
    .filter((message) => !incomingIds.has(message.id));
  return unresolved.length
    ? { ...incoming, messages: mergeMessageList(incoming.messages, unresolved) }
    : incoming;
};

export const mergeSessionRefresh = (current: SessionDetail, incoming: SessionDetail): SessionDetail => {
  const incomingIds = new Set(incoming.messages.map((message) => message.id));
  const firstOverlap = current.messages.findIndex((message) => !isOptimisticMessage(message) && incomingIds.has(message.id));
  const olderPrefix = firstOverlap > 0
    ? current.messages.slice(0, firstOverlap).filter((message) => !isOptimisticMessage(message))
    : [];
  const pending = unresolvedOptimisticMessages(incoming, current)
    .filter((message) => !incomingIds.has(message.id));
  return {
    ...incoming,
    messages: mergeMessageList(mergeMessageList(olderPrefix, incoming.messages), pending),
  };
};

export const mergeSessionDelta = (cached: SessionDetail, delta: SessionDelta): SessionDetail => {
  const upserts = new Map(delta.upserts.map((message) => [message.id, message]));
  const deleted = new Set(delta.deletes);
  const resolved = cached.messages
    .filter((message) => !deleted.has(message.id))
    .map((message) => upserts.get(message.id) || message);
  const persistedUsers = delta.upserts.filter((message) => message.role === "user" && !isOptimisticMessage(message));
  const consumed = new Set<number>();
  const withoutOptimisticDuplicates = resolved.filter((message) => (
    !isOptimisticMessage(message)
    || (() => {
      const match = persistedUsers.findIndex((persisted, index) => (
        !consumed.has(index) && persistedMatchesOptimistic(persisted, message)
      ));
      if (match < 0) return true;
      consumed.add(match);
      return false;
    })()
  ));
  const resolvedIds = new Set(withoutOptimisticDuplicates.map((message) => message.id));
  const appended = delta.upserts.filter((message) => !resolvedIds.has(message.id));
  return {
    ...cached,
    ...delta.sessionPatch,
    contentVersion: delta.contentVersion,
    messages: mergeMessageList(withoutOptimisticDuplicates, appended),
  };
};
