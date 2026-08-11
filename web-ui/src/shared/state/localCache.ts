interface LocalCacheEntry<T> {
  version: 1;
  value: T;
}

export const readLocalCache = <T>(key: string, valid: (value: unknown) => value is T): T | null => {
  try {
    const entry = JSON.parse(window.localStorage.getItem(key) || "null") as LocalCacheEntry<unknown> | null;
    return entry?.version === 1 && valid(entry.value) ? entry.value : null;
  } catch {
    return null;
  }
};

export const writeLocalCache = <T>(key: string, value: T) => {
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: 1, value } satisfies LocalCacheEntry<T>));
  } catch {}
};
