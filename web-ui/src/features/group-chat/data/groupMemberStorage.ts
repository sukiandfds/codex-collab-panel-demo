import type { StoredMember } from "../model/types";

const memberKey = "codex-collab-group-member";

export const createMemberId = () => globalThis.crypto?.randomUUID?.()
  || `member-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const readStoredMember = (): StoredMember | null => {
  try {
    const value = JSON.parse(localStorage.getItem(memberKey) || "null") as StoredMember | null;
    return value?.id && value?.name ? value : null;
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
