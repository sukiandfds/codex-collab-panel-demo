export const createConversationService = ({ primary, fallback }) => {
  let primaryAvailable = true;

  const withFallback = async (operation, ...args) => {
    if (primaryAvailable) {
      try {
        return await primary[operation](...args);
      } catch (error) {
        primaryAvailable = false;
        console.warn(`[conversation-service] app-server unavailable, using JSONL fallback: ${error.message}`);
      }
    }
    return fallback[operation](...args);
  };

  return {
    listSessions: (...args) => withFallback("listSessions", ...args),
    findSession: (...args) => withFallback("findSession", ...args),
    close: () => {
      primary.close();
      fallback.close();
    },
  };
};
