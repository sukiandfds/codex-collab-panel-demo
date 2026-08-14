export const createClientId = (fallbackPrefix = "") => globalThis.crypto?.randomUUID?.()
  || `${fallbackPrefix ? `${fallbackPrefix}-` : ""}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
