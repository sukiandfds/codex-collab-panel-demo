import { fetchJson, postJson, withAccessToken } from "../../../shared/api/http";
import type { GroupMode, GroupSendResponse, GroupSnapshot, StoredMember } from "../model/types";

export const groupApi = {
  snapshot: (signal?: AbortSignal) => fetchJson<GroupSnapshot>("/api/group/snapshot", signal),
  join: (member: StoredMember, signal?: AbortSignal) => postJson<StoredMember>("/api/group/join", {
    memberId: member.id,
    name: member.name,
  }, signal),
  presence: (member: StoredMember, signal?: AbortSignal) => postJson<StoredMember>("/api/group/presence", {
    memberId: member.id,
    name: member.name,
  }, signal),
  send: (member: StoredMember, mode: GroupMode, agentIds: string[], text: string, clientMessageId: string, attachmentIds: string[] = [], signal?: AbortSignal) => postJson<GroupSendResponse>(
    "/api/group/message",
    { memberId: member.id, authorName: member.name, mode, agentIds, text, attachmentIds, clientMessageId },
    signal,
  ),
  eventsUrl: () => withAccessToken("/events"),
};
