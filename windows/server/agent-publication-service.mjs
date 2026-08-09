const clean = (value, maxLength = 160) => String(value || "").trim().slice(0, maxLength);
const statusError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const fingerprintFor = ({ conversationId, messageId, roomId }) => JSON.stringify({
  conversationId: clean(conversationId, 120),
  messageId: clean(messageId, 160),
  roomId: clean(roomId, 120),
});

export const createAgentPublicationService = ({ conversationStore, conversations, runtimeRegistry, groupRoom, roomDirectory, publicationStore }) => {
  const inFlight = new Map();

  const readSourceMessage = async (binding, messageId) => {
    const localMessage = await conversationStore.readMessage?.(binding.conversationId, messageId);
    if (localMessage) {
      if (localMessage.role !== "assistant" || !localMessage.turnId || !String(localMessage.text || "").trim()) {
        throw statusError("只能带走已完成的 Agent 文字回复", 409);
      }
      return localMessage;
    }
    const session = runtimeRegistry
      ? await runtimeRegistry.readConversation(binding)
      : await conversations.findSession(binding.runtimeSessionId, "all");
    const message = session?.messages?.find((entry) => entry.id === clean(messageId, 160));
    if (!message || message.role !== "assistant" || !message.turnId || !String(message.text || "").trim()) {
      throw statusError("只能带走已完成的 Agent 文字回复", 409);
    }
    return message;
  };

  const publish = async ({ requestId, conversationId, messageId, roomId }) => {
    const cleanRequestId = clean(requestId, 120);
    if (!cleanRequestId || !clean(conversationId, 120) || !clean(messageId, 160) || !clean(roomId, 120)) {
      throw statusError("分享参数不完整", 400);
    }
    const fingerprint = fingerprintFor({ conversationId, messageId, roomId });
    const stored = publicationStore.get(cleanRequestId);
    if (stored) {
      if (stored.fingerprint !== fingerprint) throw statusError("requestId 已用于其他分享", 409);
      return {
        message: roomDirectory.require(stored.roomId).getMessage(stored.groupMessageId),
        conversationId: stored.conversationId,
        deduplicated: true,
      };
    }

    const existing = inFlight.get(cleanRequestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw statusError("requestId 已用于其他分享", 409);
      return existing.promise;
    }

    const promise = (async () => {
      const binding = await conversationStore.resolve({ conversationId });
      const targets = await conversationStore.getShareTargets({ conversationId });
      if (!targets.rooms.some((room) => room.id === clean(roomId, 120))) {
        throw statusError("目标群聊不可用", 404);
      }
      const message = await readSourceMessage(binding, messageId);
      if (message.text.length > 12000) throw statusError("回复内容过长，无法带到群聊", 413);
      const targetRoom = roomDirectory.require(roomId);
      const agent = groupRoom.getAgent(binding.agentId);
      if (!agent) throw statusError("Agent 不存在", 404);
      if (!targetRoom.getAgent(binding.agentId)) throw statusError("Agent 无权在目标群聊发言", 403);
      const result = await targetRoom.addMessageWithStatus({
        type: "agent",
        authorId: agent.id,
        authorName: agent.name,
        agentId: agent.id,
        targetAgentIds: [],
        mode: "discussion",
        text: message.text,
        attachments: [],
        clientMessageId: cleanRequestId,
        preserveText: true,
      });
      await publicationStore.set({
        requestId: cleanRequestId,
        fingerprint,
        conversationId: binding.conversationId,
        sourceMessageId: clean(messageId, 160),
        roomId: clean(roomId, 120),
        groupMessageId: result.message.id,
        createdAt: new Date().toISOString(),
      });
      return {
        message: result.message,
        conversationId: binding.conversationId,
        deduplicated: !result.created,
      };
    })();
    inFlight.set(cleanRequestId, { fingerprint, promise });
    try {
      return await promise;
    } finally {
      if (inFlight.get(cleanRequestId)?.promise === promise) inFlight.delete(cleanRequestId);
    }
  };

  return { publish };
};
