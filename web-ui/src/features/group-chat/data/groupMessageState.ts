import type { GroupMessage } from "../model/types";

const compareMessages = (left: GroupMessage, right: GroupMessage) => {
  const leftSequence = Number.isSafeInteger(left.sequence) ? left.sequence! : Number.MAX_SAFE_INTEGER;
  const rightSequence = Number.isSafeInteger(right.sequence) ? right.sequence! : Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  return timeDifference || left.id.localeCompare(right.id);
};

const sameMessage = (left: GroupMessage, right: GroupMessage) => left.id === right.id
  || Boolean(left.clientMessageId && right.clientMessageId && left.clientMessageId === right.clientMessageId);

export const upsertGroupMessage = (messages: GroupMessage[], incoming: GroupMessage) => {
  const matchingIndexes = messages
    .map((message, index) => sameMessage(message, incoming) ? index : -1)
    .filter((index) => index >= 0);
  const firstIndex = matchingIndexes[0];
  const next = firstIndex !== undefined
    ? messages.flatMap((message, index) => {
      if (index === firstIndex) return [incoming];
      return matchingIndexes.includes(index) ? [] : [message];
    })
    : [...messages, incoming];
  return next.sort(compareMessages);
};

export const keepUnacknowledgedMessages = (messages: GroupMessage[], pending: GroupMessage[]) => {
  const next = [...messages];
  for (const message of pending) {
    if (!next.some((current) => sameMessage(current, message))) next.push(message);
  }
  return next.sort(compareMessages);
};

export const removePendingMessage = (messages: GroupMessage[], clientMessageId: string) => messages
  .filter((message) => !(message.pending && message.clientMessageId === clientMessageId));
