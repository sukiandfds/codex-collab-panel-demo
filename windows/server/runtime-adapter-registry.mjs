const statusError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

export const createCodexRuntimeAdapter = ({ conversations, ensureSession }) => ({
  kind: "codex",
  readConversation: (runtimeSessionId) => conversations.findSession(runtimeSessionId, "all"),
  ensureConversation: (agent, context = {}) => ensureSession(agent, context),
});

export const createRuntimeAdapterRegistry = ({ adapters = [] } = {}) => {
  const registered = new Map(adapters
    .filter((adapter) => adapter?.kind && typeof adapter.readConversation === "function")
    .map((adapter) => [adapter.kind, adapter]));
  return {
    readConversation: async (binding) => {
      const adapter = registered.get(binding?.runtimeKind);
      if (!adapter) throw statusError(`不支持的 Runtime：${binding?.runtimeKind || "unknown"}`, 503);
      return adapter.readConversation(binding.runtimeSessionId);
    },
    ensureConversation: async ({ runtimeKind, agent, conversationId = "" }) => {
      const adapter = registered.get(runtimeKind);
      if (!adapter?.ensureConversation) throw statusError(`Runtime 无法创建对话：${runtimeKind || "unknown"}`, 503);
      return adapter.ensureConversation(agent, { runtimeKind, conversationId });
    },
  };
};
