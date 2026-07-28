import { fetchJson, postJson, withAccessToken } from "../../../shared/api/http";
import type { GroupMode, GroupSnapshot, StoredMember } from "../model/types";

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
  send: (member: StoredMember, mode: GroupMode, agentIds: string[], text: string, attachmentIds: string[] = [], signal?: AbortSignal) => postJson(
    "/api/group/message",
    { memberId: member.id, authorName: member.name, mode, agentIds, text, attachmentIds },
    signal,
  ),
  eventsUrl: () => withAccessToken("/events"),
};
