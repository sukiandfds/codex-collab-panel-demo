import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const clean = (value, max = 300) => String(value || "").trim().slice(0, max);
const clone = (value) => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();

const readState = async (stateFile) => {
  try {
    const value = JSON.parse(await fs.readFile(stateFile, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
};

export const createEmployeeGrowthStore = async ({ stateFile, registry }) => {
  const stored = await readState(stateFile);
  const entries = new Map();
  for (const employee of registry.list()) {
    const value = stored.employees?.[employee.id] || {};
    entries.set(employee.id, {
      facts: Array.isArray(value.facts) ? value.facts : [],
      proposals: Array.isArray(value.proposals) ? value.proposals : [],
      logs: Array.isArray(value.logs) ? value.logs : [],
    });
  }
  let writeQueue = Promise.resolve();
  const persist = () => {
    const payload = JSON.stringify({
      version: 1,
      employees: Object.fromEntries(entries),
    }, null, 2);
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      const temp = `${stateFile}.${process.pid}.tmp`;
      await fs.writeFile(temp, `${payload}\n`, "utf8");
      await fs.rename(temp, stateFile);
    });
    return writeQueue;
  };
  const requireEntry = (employeeId) => {
    const id = clean(employeeId, 80);
    const entry = entries.get(id);
    if (!entry) throw Object.assign(new Error("Employee does not exist."), { statusCode: 404 });
    return { id, entry };
  };
  const appendLog = (entry, log) => {
    entry.logs.push({ id: randomUUID(), createdAt: now(), ...log });
    if (entry.logs.length > 500) entry.logs.splice(0, entry.logs.length - 500);
  };
  await persist();
  return {
    list: () => [...entries.entries()].map(([employeeId, value]) => ({ employeeId, ...clone(value) })),
    get: (employeeId) => {
      const { id, entry } = requireEntry(employeeId);
      return { employeeId: id, ...clone(entry) };
    },
    addFact: async (employeeId, fact, { requestId = "" } = {}) => {
      const { id, entry } = requireEntry(employeeId);
      const key = clean(requestId, 120);
      if (key && entry.facts.some((item) => item.requestId === key)) return clone(entry.facts.find((item) => item.requestId === key));
      const value = { id: randomUUID(), requestId: key || null, createdAt: now(), status: "saved", ...fact };
      entry.facts.push(value);
      appendLog(entry, { action: "fact_saved", itemId: value.id, requestId: key || null });
      await persist();
      return clone(value);
    },
    addProposal: async (employeeId, proposal, { requestId = "" } = {}) => {
      const { id, entry } = requireEntry(employeeId);
      const key = clean(requestId, 120);
      const duplicate = key && entry.proposals.find((item) => item.requestId === key);
      if (duplicate) return clone(duplicate);
      const value = {
        id: randomUUID(),
        requestId: key || null,
        createdAt: now(),
        status: "pending",
        ...proposal,
      };
      entry.proposals.push(value);
      appendLog(entry, { action: "proposal_pending", itemId: value.id, requestId: key || null });
      await persist();
      return clone(value);
    },
    decide: async (employeeId, proposalId, decision, { requestId = "" } = {}) => {
      const { id, entry } = requireEntry(employeeId);
      const proposal = entry.proposals.find((item) => item.id === clean(proposalId, 120));
      if (!proposal) throw Object.assign(new Error("Growth proposal does not exist."), { statusCode: 404 });
      if (proposal.status !== "pending") return clone(proposal);
      proposal.status = decision === "approved" ? "approved" : "rejected";
      delete proposal.error;
      proposal.decidedAt = now();
      proposal.decisionRequestId = clean(requestId, 120) || null;
      appendLog(entry, { action: `proposal_${proposal.status}`, itemId: proposal.id, requestId: proposal.decisionRequestId });
      await persist();
      return clone(proposal);
    },
    requeue: async (employeeId, proposalId, { error = "", requestId = "" } = {}) => {
      const { entry } = requireEntry(employeeId);
      const proposal = entry.proposals.find((item) => item.id === clean(proposalId, 120));
      if (!proposal) throw Object.assign(new Error("Growth proposal does not exist."), { statusCode: 404 });
      proposal.status = "pending";
      proposal.error = clean(error, 500) || null;
      appendLog(entry, { action: "proposal_requeued", itemId: proposal.id, requestId: clean(requestId, 120) || null });
      await persist();
      return clone(proposal);
    },
    appendLog: async (employeeId, log) => {
      const { entry } = requireEntry(employeeId);
      appendLog(entry, log);
      await persist();
    },
    close: () => writeQueue,
  };
};
