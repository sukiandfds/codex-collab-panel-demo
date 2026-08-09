const statusError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

export const createGroupRoomDirectory = ({ rooms = [] } = {}) => {
  const registered = new Map();

  for (const roomStore of rooms) {
    const room = roomStore?.snapshot?.().room;
    if (room?.id) registered.set(room.id, roomStore);
  }

  const listForAgent = (agentId) => [...registered.values()]
    .filter((roomStore) => Boolean(roomStore.getAgent(agentId)))
    .map((roomStore) => roomStore.snapshot().room);

  return {
    listForAgent,
    get: (roomId) => registered.get(String(roomId || "").trim()) || null,
    require: (roomId) => {
      const roomStore = registered.get(String(roomId || "").trim());
      if (!roomStore) throw statusError("目标群聊不可用", 404);
      return roomStore;
    },
  };
};
