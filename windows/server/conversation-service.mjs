export const createConversationService = ({ primary, fallback }) => {
  const withFallback = async (operation, ...args) => {
    try {
      return await primary[operation](...args);
    } catch (error) {
      console.warn(`[conversation-service] app-server request failed, using JSONL fallback: ${error.message}`);
      return fallback[operation](...args);
    }
  };

  const mediaTypes = new Set(["image", "audio", "video"]);
  const enrichWithFallbackMedia = (session, fallbackSession) => {
    if (!session?.messages || !fallbackSession?.messages) return session;
    const fallbackMessages = [...fallbackSession.messages];
    return {
      ...session,
      messages: session.messages.map((message) => {
        const index = fallbackMessages.findIndex((candidate) => (
          candidate.role === message.role && candidate.text === message.text
        ));
        if (index < 0) return message;
        const [candidate] = fallbackMessages.splice(index, 1);
        const createdAt = message.createdAt || candidate.createdAt;
        const extra = (candidate.blocks || []).filter((block) => mediaTypes.has(block.type));
        if (!extra.length) return createdAt ? { ...message, createdAt } : message;
        const blocks = message.blocks || [];
        const existing = new Set(blocks.map((block) => `${block.type}:${block.source || ""}`));
        return {
          ...message,
          createdAt,
          blocks: [...blocks, ...extra.filter((block) => !existing.has(`${block.type}:${block.source || ""}`))],
        };
      }),
    };
  };

  const findSession = async (...args) => {
    const [primaryResult, fallbackResult] = await Promise.allSettled([
      primary.findSession(...args),
      fallback.findSession(...args),
    ]);
    if (primaryResult.status === "fulfilled") {
      return enrichWithFallbackMedia(
        primaryResult.value,
        fallbackResult.status === "fulfilled" ? fallbackResult.value : null,
      );
    }
    if (fallbackResult.status === "fulfilled") {
      console.warn(`[conversation-service] app-server request failed, using JSONL fallback: ${primaryResult.reason?.message || primaryResult.reason}`);
      return fallbackResult.value;
    }
    throw primaryResult.reason;
  };

  return {
    listSessions: (...args) => withFallback("listSessions", ...args),
    createSession: (...args) => primary.createSession(...args),
    findSession,
    sendMessage: (...args) => primary.sendMessage(...args),
    steerMessage: (...args) => primary.steerMessage(...args),
    interrupt: (...args) => primary.interrupt(...args),
    forkSession: (...args) => primary.forkSession(...args),
    archiveSession: (...args) => primary.archiveSession(...args),
    unarchiveSession: (...args) => primary.unarchiveSession(...args),
    listModels: (...args) => primary.listModels(...args),
    updateModel: (...args) => primary.updateModel(...args),
    updateReasoningEffort: (...args) => primary.updateReasoningEffort(...args),
    getRuntimeContext: (...args) => primary.getRuntimeContext(...args),
    getThreadStatus: (...args) => primary.getThreadStatus(...args),
    compactContext: (...args) => primary.compactContext(...args),
    close: () => {
      primary.close();
      fallback.close();
    },
  };
};
