const notFound = (error) => error?.statusCode === 404 || /对话不存在|not found/iu.test(String(error?.message || error));

const missingConversation = () => Object.assign(new Error("对话不存在"), { statusCode: 404 });

export const createAgentConversationStoreRouter = ({ primary, fallbacks = [] }) => {
  const stores = [primary, ...fallbacks].filter(Boolean);
  if (!stores.length) throw new Error("Agent conversation store is required.");

  const locateConversation = async (conversationId) => {
    let lastError = null;
    for (const store of stores) {
      try {
        return { store, binding: await store.resolve({ conversationId }) };
      } catch (error) {
        if (!notFound(error)) throw error;
        lastError = error;
      }
    }
    throw lastError || missingConversation();
  };

  const locateRuntime = (runtimeKind, runtimeSessionId) => {
    for (const store of stores) {
      const binding = store.findByRuntimeSession?.(runtimeKind, runtimeSessionId);
      if (binding) return { store, binding };
    }
    return null;
  };

  const locateAgent = (agentId, conversationKind = "") => {
    for (const store of stores) {
      const binding = conversationKind
        ? store.findByAgentKind?.(agentId, conversationKind)
        : store.findByAgent?.(agentId);
      if (binding) return { store, binding };
    }
    return null;
  };

  const locate = async (options = {}) => {
    if (options.conversationId) return locateConversation(options.conversationId);
    const runtimeKind = options.runtimeKind || "codex";
    const runtimeSessionId = options.runtimeSessionId || options.threadId || "";
    if (runtimeSessionId) {
      const located = locateRuntime(runtimeKind, runtimeSessionId);
      if (located) return located;
    }
    if (options.agentId) {
      const located = locateAgent(options.agentId, options.conversationKind || "");
      if (located) return located;
    }
    return { store: primary, binding: await primary.resolve(options) };
  };

  return {
    resolve: async (options) => (await locate(options)).binding,
    bindRuntime: (options) => primary.bindRuntime(options),
    openForAgent: async (options) => {
      const existing = locateAgent(options?.agentId, "direct");
      return existing?.binding || primary.openForAgent(options);
    },
    openGroupForAgent: (options) => primary.openGroupForAgent(options),
    findByAgent: (agentId) => locateAgent(agentId)?.binding || null,
    findByAgentKind: (agentId, conversationKind) => locateAgent(agentId, conversationKind)?.binding || null,
    findByRuntimeSession: (runtimeKind, runtimeSessionId) => locateRuntime(runtimeKind, runtimeSessionId)?.binding || null,
    readMessages: async (conversationId) => {
      const located = await locateConversation(conversationId);
      return located.store.readMessages(conversationId);
    },
    readMessage: async (conversationId, messageId) => {
      const located = await locateConversation(conversationId);
      return located.store.readMessage(conversationId, messageId);
    },
    appendMessage: async ({ conversationId, message }) => {
      const located = await locateConversation(conversationId);
      return located.store.appendMessage({ conversationId, message });
    },
    recordRuntimeMessage: async (runtimeKind, runtimeSessionId, message) => {
      const located = locateRuntime(runtimeKind, runtimeSessionId);
      return located?.store.recordRuntimeMessage?.(runtimeKind, runtimeSessionId, message) || null;
    },
    recordRuntimeEvent: async (event) => {
      const threadId = String(event?.params?.threadId || "").trim();
      const located = threadId ? locateRuntime("codex", threadId) : null;
      return located?.store.recordRuntimeEvent?.(event) || null;
    },
    getShareTargets: async (options) => {
      const located = await locate(options);
      return located.store.getShareTargets({ conversationId: located.binding.conversationId });
    },
    close: () => Promise.resolve(),
  };
};
