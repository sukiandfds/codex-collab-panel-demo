const mergeSupplementalMessages = (session, supplemental = []) => {
  if (!session || !supplemental.length) return session;
  const seen = new Set();
  const combined = [...session.messages, ...supplemental]
    .filter((message) => {
      if (!message?.id || seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    })
    .map((message, index) => ({ message, index, timestamp: Date.parse(message.createdAt || "") }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.timestamp) ? left.timestamp : Number.MIN_SAFE_INTEGER + left.index;
      const rightTime = Number.isFinite(right.timestamp) ? right.timestamp : Number.MIN_SAFE_INTEGER + right.index;
      return leftTime - rightTime || left.index - right.index;
    })
    .map(({ message }) => message);
  const latestUser = [...combined].reverse().find((message) => message.role === "user")?.text || session.latestUser;
  const latestAssistant = [...combined].reverse().find((message) => message.role === "assistant")?.text || session.latestAssistant;
  const updatedAt = combined.reduce((latest, message) => {
    const value = Date.parse(message.createdAt || "");
    const latestValue = Date.parse(latest || "");
    return Number.isFinite(value) && (!Number.isFinite(latestValue) || value > latestValue) ? message.createdAt : latest;
  }, session.updatedAt);
  return {
    ...session,
    messages: combined,
    latestUser,
    latestAssistant,
    updatedAt,
    messageCount: session.hasMore === false ? combined.length : session.messageCount,
  };
};

const sessionFromSupplementalMessages = (threadId, messages) => {
  const latestUser = [...messages].reverse().find((message) => message.role === "user")?.text || "";
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.text || "";
  const updatedAt = messages.reduce((latest, message) => {
    const value = Date.parse(message.createdAt || "");
    const latestValue = Date.parse(latest || "");
    return Number.isFinite(value) && (!Number.isFinite(latestValue) || value > latestValue) ? message.createdAt : latest;
  }, "");
  return {
    threadId,
    source: "codex",
    title: latestUser.slice(0, 80) || "Negus Image",
    updatedAt,
    messageCount: messages.length,
    latestUser,
    latestAssistant,
    archived: false,
    forkedFromId: null,
    messages,
    hasMore: false,
    nextBefore: null,
    nextCursor: null,
  };
};

const mergeSupplementalSessions = (sessions = [], supplemental = []) => {
  const byId = new Map(sessions.map((session) => [session.threadId, session]));
  for (const extra of supplemental) {
    const session = byId.get(extra.threadId);
    if (!session) {
      byId.set(extra.threadId, extra);
      continue;
    }
    const supplementalIsNewer = Date.parse(extra.updatedAt || "") > Date.parse(session.updatedAt || "");
    const untitled = !session.title || session.title === "未命名会话";
    byId.set(extra.threadId, {
      ...session,
      title: untitled ? extra.title : session.title,
      updatedAt: supplementalIsNewer ? extra.updatedAt : session.updatedAt,
      latestUser: supplementalIsNewer ? extra.latestUser : session.latestUser,
      latestAssistant: supplementalIsNewer ? extra.latestAssistant : session.latestAssistant,
      messageCount: Number.isSafeInteger(session.messageCount)
        ? session.messageCount + extra.messageCount
        : session.messageCount,
    });
  }
  return [...byId.values()].sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""));
};

export const createConversationService = ({ primary, fallback, contentVersionStore, supplementalMessages }) => {
  const inFlightFinds = new Map();
  const missingThreadPattern = /(?:thread|conversation|session).*(?:not found|does not exist|unknown)|no persisted turns/iu;

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
      let session = await withFallback("findSession", ...args);
      const threadId = String(args[0] || "");
      const options = args[2] || {};
      const recentWindow = options.before === undefined && options.cursor === undefined;
      if (supplementalMessages && recentWindow) {
        const supplemental = await supplementalMessages.list(threadId);
        session = session
          ? mergeSupplementalMessages(session, supplemental)
          : supplemental.length ? sessionFromSupplementalMessages(threadId, supplemental) : null;
      }
      if (!session || !contentVersionStore) return session;
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

  const listSessions = async (...args) => {
    const sessions = await withFallback("listSessions", ...args);
    const source = String(args[0] || "all");
    const archived = Boolean(args[1]);
    if (!supplementalMessages?.listSessions || archived || source === "happy") return sessions;
    return mergeSupplementalSessions(sessions, await supplementalMessages.listSessions());
  };

  const sendMessage = async (threadId, text, attachments = []) => {
    try {
      return { ...(await primary.sendMessage(threadId, text, attachments)), threadId };
    } catch (error) {
      if (!missingThreadPattern.test(String(error?.message || error))
        || !supplementalMessages?.migrationContext
        || !supplementalMessages?.markMigrated) throw error;
      const legacy = await supplementalMessages.migrationContext(threadId);
      if (!legacy?.attachments?.length) throw error;
      const created = await primary.createSession();
      const nextThreadId = created?.threadId;
      if (!nextThreadId) throw new Error("Codex did not return a thread for legacy image migration");
      const mergedAttachments = [...attachments];
      const knownPaths = new Set(mergedAttachments.map((attachment) => attachment.path));
      for (const attachment of legacy.attachments) {
        if (!knownPaths.has(attachment.path)) mergedAttachments.push(attachment);
      }
      const result = await primary.sendMessage(nextThreadId, text, mergedAttachments);
      await supplementalMessages.markMigrated(threadId, nextThreadId);
      return { ...result, threadId: nextThreadId, migratedFromThreadId: threadId };
    }
  };

  return {
    listSessions,
    createSession: (...args) => primary.createSession(...args),
    renameSession: (...args) => primary.renameSession(...args),
    findSession,
    sendMessage,
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
    reviewSession: (...args) => primary.reviewSession(...args),
    close: () => {
      inFlightFinds.clear();
      primary.close();
      fallback.close();
      void contentVersionStore?.close?.();
    },
  };
};
