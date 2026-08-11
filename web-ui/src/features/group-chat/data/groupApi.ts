import { fetchJson, postJson, withAccessToken } from "../../../shared/api/http";
import type { GroupAgent, GroupMode, GroupRoomListResponse, GroupSendResponse, GroupSnapshot, StoredMember } from "../model/types";

const roomQuery = (roomId: string) => roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";

export const groupApi = {
  rooms: (signal?: AbortSignal) => fetchJson<GroupRoomListResponse>("/api/group/rooms", signal),
  snapshot: (roomId = "", signal?: AbortSignal) => fetchJson<GroupSnapshot>(`/api/group/snapshot${roomQuery(roomId)}`, signal),
  join: (member: StoredMember, roomId = "", signal?: AbortSignal) => postJson<StoredMember>("/api/group/join", {
    memberId: member.id,
    name: member.name,
    roomId,
  }, signal),
  presence: (member: StoredMember, roomId = "", signal?: AbortSignal) => postJson<StoredMember>("/api/group/presence", {
    memberId: member.id,
    name: member.name,
    roomId,
  }, signal),
  updateAgentSettings: (agentId: string, model: string, reasoningEffort: string, roomId = "", signal?: AbortSignal) => postJson<GroupAgent>(
    "/api/group/agent-settings",
    { agentId, model, reasoningEffort, roomId },
    signal,
  ),
  send: (member: StoredMember, roomId: string, mode: GroupMode, agentIds: string[], text: string, clientMessageId: string, attachmentIds: string[] = [], signal?: AbortSignal) => postJson<GroupSendResponse>(
    "/api/group/message",
    { memberId: member.id, authorName: member.name, roomId, mode, agentIds, text, attachmentIds, clientMessageId },
    signal,
  ),
  eventsUrl: () => withAccessToken("/events"),
};
