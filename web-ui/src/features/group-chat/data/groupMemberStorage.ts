import { createClientId } from "../../../shared/id/clientId";
import type { StoredMember } from "../model/types";

const memberKey = "negus-group-member";
const legacyMemberKey = "codex-collab-group-member";

const parseStoredMember = (raw: string | null): StoredMember | null => {
  if (!raw) return null;
  const value = JSON.parse(raw) as StoredMember | null;
  return value?.id && value?.name ? value : null;
};

export const createMemberId = () => createClientId("member");

export const readStoredMember = (): StoredMember | null => {
  try {
    const current = parseStoredMember(localStorage.getItem(memberKey));
    if (current) return current;
    const legacy = parseStoredMember(localStorage.getItem(legacyMemberKey));
    if (legacy) localStorage.setItem(memberKey, JSON.stringify(legacy));
    return legacy;
  } catch {
    return null;
  }
};

export const writeStoredMember = (member: StoredMember) => {
  try {
    localStorage.setItem(memberKey, JSON.stringify(member));
  } catch {
    // Storage may be unavailable in private or restricted mobile browsers.
  }
};
