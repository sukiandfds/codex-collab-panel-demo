import fs from "node:fs/promises";
import path from "node:path";

const statusError = (message) => Object.assign(new Error(message), { statusCode: 503 });

const validateVersion = (value) => {
  const buildId = typeof value?.buildId === "string" ? value.buildId.trim() : "";
  const builtAt = typeof value?.builtAt === "string" ? value.builtAt.trim() : "";
  if (!buildId || buildId.length > 128 || !builtAt || Number.isNaN(Date.parse(builtAt))) {
    throw statusError("Web version metadata is invalid.");
  }
  return { buildId, builtAt };
};

export const createWebVersionReader = (webRoot) => {
  const versionFile = path.join(path.resolve(webRoot), "version.json");
  let lastKnownVersion = null;

  return async () => {
    try {
      const version = validateVersion(JSON.parse(await fs.readFile(versionFile, "utf8")));
      lastKnownVersion = version;
      return version;
    } catch (error) {
      if (lastKnownVersion) return lastKnownVersion;
      if (error?.statusCode === 503) throw error;
      throw statusError("Web version metadata is unavailable.");
    }
  };
};
