const statusError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const clean = (value, maxLength = 240) => String(value || "").trim().slice(0, maxLength);

export const createGroupRoomDirectory = ({ rooms = [] } = {}) => {
  const registered = new Map();

  for (const roomStore of rooms) {
    const room = roomStore?.snapshot?.().room;
    if (room?.id) registered.set(room.id, roomStore);
  }

  const listForAgent = (agentId) => [...registered.values()]
    .filter((roomStore) => Boolean(roomStore.getAgent(agentId)))
    .map((roomStore) => roomStore.snapshot().room);

  const readAgentMessages = (agentId) => {
    const cleanAgentId = clean(agentId, 80);
    if (!cleanAgentId) return [];
    return [...registered.values()]
      .filter((roomStore) => Boolean(roomStore.getAgent(cleanAgentId)))
      .flatMap((roomStore) => {
        const snapshot = roomStore.snapshot();
        return snapshot.messages
          .filter((message) => message?.type === "agent"
            && (message.agentId === cleanAgentId || message.authorId === cleanAgentId)
            && String(message.text || "").trim())
          .map((message) => ({
            id: `group:${snapshot.room.id}:${message.id}`,
            role: "assistant",
            text: String(message.text || ""),
            createdAt: message.createdAt,
            agentId: cleanAgentId,
            source: "group",
            roomId: snapshot.room.id,
            projectId: snapshot.projectId,
            groupMessageId: message.id,
          }));
      })
      .sort((left, right) => Date.parse(left.createdAt || "") - Date.parse(right.createdAt || ""));
  };

  const list = () => [...registered.values()].map((roomStore) => roomStore.snapshot().room);

  return {
    list,
    listForAgent,
    readAgentMessages,
    get: (roomId) => registered.get(String(roomId || "").trim()) || null,
    require: (roomId) => {
      const roomStore = registered.get(String(roomId || "").trim());
      if (!roomStore) throw statusError("目标群聊不可用", 404);
      return roomStore;
    },
  };
};
