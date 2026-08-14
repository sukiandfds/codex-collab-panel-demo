export const currentConversationId = () => new URLSearchParams(window.location.search).get("conversation") || "";

export const conversationQuery = () => {
  const conversationId = currentConversationId();
  return conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : "";
};

export const withConversation = <T extends Record<string, unknown>>(body: T) => {
  const conversationId = currentConversationId();
  return conversationId ? { ...body, conversationId } : body;
};
