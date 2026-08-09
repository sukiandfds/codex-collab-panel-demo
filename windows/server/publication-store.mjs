import fs from "node:fs/promises";
import path from "node:path";

const clean = (value, maxLength = 160) => String(value || "").trim().slice(0, maxLength);

export const createPublicationStore = async ({ stateFile, maxRecords = 2000 }) => {
  let records = new Map();
  try {
    const stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
    for (const record of Array.isArray(stored?.publications) ? stored.publications : []) {
      const requestId = clean(record?.requestId, 120);
      if (requestId) records.set(requestId, record);
    }
  } catch {}

  let writeQueue = Promise.resolve();
  const persist = () => {
    const retained = [...records.values()].slice(-maxRecords);
    const payload = JSON.stringify({ version: 1, publications: retained }, null, 2);
    writeQueue = writeQueue
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(stateFile), { recursive: true });
        const temporary = `${stateFile}.${process.pid}.tmp`;
        await fs.writeFile(temporary, payload, "utf8");
        await fs.rename(temporary, stateFile);
      });
    return writeQueue;
  };

  await persist();
  return {
    get: (requestId) => records.get(clean(requestId, 120)) || null,
    set: async (record) => {
      const requestId = clean(record?.requestId, 120);
      if (!requestId) throw new Error("requestId 不能为空");
      records.set(requestId, record);
      if (records.size > maxRecords) records = new Map([...records.entries()].slice(-maxRecords));
      await persist();
      return record;
    },
    close: () => writeQueue,
  };
};
