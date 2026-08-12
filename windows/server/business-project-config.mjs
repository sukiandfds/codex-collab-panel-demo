import fs from "node:fs/promises";
import path from "node:path";

const clean = (value, maxLength = 800) => String(value || "").trim().slice(0, maxLength);

export const loadBusinessProjects = async (configFile) => {
  try {
    const parsed = JSON.parse(await fs.readFile(configFile, "utf8"));
    return (Array.isArray(parsed?.projects) ? parsed.projects : [])
      .map((entry) => {
        const root = clean(entry?.root);
        if (!root) return null;
        return {
          key: clean(entry.key, 160) || path.basename(root),
          name: clean(entry.name, 240) || path.basename(root),
          root: path.resolve(root),
          provider: clean(entry.provider, 80) || "codex",
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};
