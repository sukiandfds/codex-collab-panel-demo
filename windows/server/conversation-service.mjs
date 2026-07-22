export const createConversationService = ({ primary, fallback }) => {
  const withFallback = async (operation, ...args) => {
    try {
      return await primary[operation](...args);
    } catch (error) {
      console.warn(`[conversation-service] app-server request failed, using JSONL fallback: ${error.message}`);
      return fallback[operation](...args);
    }
  };

  return {
    listSessions: (...args) => withFallback("listSessions", ...args),
    findSession: (...args) => withFallback("findSession", ...args),
    sendMessage: (...args) => primary.sendMessage(...args),
    close: () => {
      primary.close();
      fallback.close();
    },
  };
};
