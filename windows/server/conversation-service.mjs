export const createConversationService = ({ primary, fallback, contentVersionStore }) => {
  const inFlightFinds = new Map();

  const withFallback = async (operation, ...args) => {
    try {
      return await primary[operation](...args);
    } catch (error) {
      console.warn(`[conversation-service] app-server request failed, using JSONL fallback: ${error.message}`);
      return fallback[operation](...args);
    }
  };

  const findSession = (...args) => {
    const key = JSON.stringify({
      threadId: String(args[0] || ""),
      source: String(args[1] || "all"),
      options: args[2] || {},
    });
    const existing = inFlightFinds.get(key);
    if (existing) return existing;

    const request = (async () => {
      const session = await withFallback("findSession", ...args);
      if (!session || !contentVersionStore) return session;
      const threadId = String(args[0] || "");
      const options = args[2] || {};
      const recentWindow = options.before === undefined && options.cursor === undefined;
      if (!recentWindow) return contentVersionStore.decorate(threadId, session);
      return contentVersionStore.sync(threadId, session, {
        requestedVersion: options.contentVersion,
        incremental: Number.isSafeInteger(options.contentVersion),
      });
    })();
    inFlightFinds.set(key, request);
    void request.finally(() => {
      if (inFlightFinds.get(key) === request) inFlightFinds.delete(key);
    }).catch(() => {});
    return request;
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
      inFlightFinds.clear();
      primary.close();
      fallback.close();
      void contentVersionStore?.close?.();
    },
  };
};
