import type { SessionDelta, SessionDetail, SessionMessage } from "../model/types";

const isOptimisticMessage = (message: SessionMessage) => message.id.startsWith("optimistic-");

const timestampOf = (message: SessionMessage) => {
  const timestamp = Date.parse(message.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : null;
};

const sameSubmission = (left: SessionMessage, right: SessionMessage) => (
  left.role === "user"
  && right.role === "user"
  && Boolean(left.submissionId)
  && left.submissionId === right.submissionId
);

const sameInitialTurn = (left: SessionMessage, right: SessionMessage) => (
  left.role === "user"
  && right.role === "user"
  && (isOptimisticMessage(left) || isOptimisticMessage(right))
  && Boolean(left.turnId)
  && left.turnId === right.turnId
);

const sameUserMessage = (left: SessionMessage, right: SessionMessage) => (
  sameSubmission(left, right) || sameInitialTurn(left, right)
);

const persistedMatchesOptimistic = (persisted: SessionMessage, optimistic: SessionMessage) => {
  return !isOptimisticMessage(persisted)
    && isOptimisticMessage(optimistic)
    && sameUserMessage(persisted, optimistic);
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

    const replacementIndex = merged.findIndex((current) => sameUserMessage(current, message));
    if (replacementIndex >= 0) {
      const current = merged[replacementIndex];
      if (isOptimisticMessage(message) && !isOptimisticMessage(current)) return;
      indexes.delete(current.id);
      merged[replacementIndex] = message;
      indexes.set(message.id, replacementIndex);
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
