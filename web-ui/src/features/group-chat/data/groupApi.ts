import { fetchJson, postJson, withAccessToken } from "../../../shared/api/http";
import type { GroupAgent, GroupInterruptResponse, GroupMessagePage, GroupRoomListResponse, GroupSendResponse, GroupSnapshot, StoredMember } from "../model/types";

const roomQuery = (roomId: string) => roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";
const messageQuery = (roomId: string, params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams(roomId ? { roomId } : {});
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return query.toString();
};

export const groupApi = {
  rooms: (signal?: AbortSignal) => fetchJson<GroupRoomListResponse>("/api/group/rooms", signal),
  snapshot: (roomId = "", signal?: AbortSignal) => fetchJson<GroupSnapshot>(`/api/group/snapshot${roomQuery(roomId)}`, signal),
  messages: (roomId = "", params: Record<string, string | number | undefined> = {}, signal?: AbortSignal) => fetchJson<GroupMessagePage>(
    `/api/group/messages?${messageQuery(roomId, params)}`,
    signal,
  ),
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
  send: (member: StoredMember, roomId: string, text: string, clientMessageId: string, attachmentIds: string[] = [], signal?: AbortSignal) => postJson<GroupSendResponse>(
    "/api/group/message",
    { memberId: member.id, authorName: member.name, roomId, text, attachmentIds, clientMessageId },
    signal,
  ),
  interrupt: (roomId = "", signal?: AbortSignal) => postJson<GroupInterruptResponse>(
    "/api/group/interrupt",
    { roomId },
    signal,
  ),
  eventsUrl: () => withAccessToken("/events"),
};
