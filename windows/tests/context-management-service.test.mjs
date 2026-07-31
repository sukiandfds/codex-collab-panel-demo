import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createContextManagementService } from "../server/context-management-service.mjs";

const createService = async ({ active = false } = {}) => {
  const events = [];
  const compacted = [];
  let executionActive = active;
  const service = await createContextManagementService({
    stateFile: path.join(os.tmpdir(), `missing-context-settings-${process.pid}-${Date.now()}.json`),
    broadcast: (event) => events.push(event),
    getExecutionStatus: () => ({ active: executionActive }),
    getRuntimeContext: async () => ({ model: "gpt-5.6-sol", reasoningEffort: "medium" }),
    compactContext: async (threadId) => { compacted.push(threadId); },
  });
  return { service, events, compacted, setExecutionActive: (value) => { executionActive = value; } };
};

test("reports the real model and current context percentage", async () => {
  const { service } = await createService();
  await service.load("thread-1");
  service.handleProtocolMessage({
    method: "thread/tokenUsage/updated",
    params: {
      threadId: "thread-1",
      tokenUsage: { last: { totalTokens: 120000 }, modelContextWindow: 240000 },
    },
  });

  const status = service.getStatus("thread-1");
  assert.equal(status.model, "gpt-5.6-sol");
  assert.equal(status.reasoningEffort, "medium");
  assert.equal(status.usedTokens, 120000);
  assert.equal(status.contextWindow, 240000);
  assert.equal(status.percentage, 50);
});

test("tracks the protocol effort field after thread settings change", async () => {
  const { service } = await createService();
  await service.load("thread-1");
  service.handleProtocolMessage({
    method: "thread/settings/updated",
    params: { threadId: "thread-1", threadSettings: { model: "gpt-5.6-sol", effort: "high" } },
  });

  assert.equal(service.getStatus("thread-1").reasoningEffort, "high");
});

test("queues auto compaction until the active turn completes", async () => {
  const { service, compacted, setExecutionActive } = await createService({ active: true });
  await service.load("thread-1");
  service.handleProtocolMessage({
    method: "thread/tokenUsage/updated",
    params: {
      threadId: "thread-1",
      tokenUsage: { last: { totalTokens: 210000 }, modelContextWindow: 240000 },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.getStatus("thread-1").phase, "queued");
  assert.deepEqual(compacted, []);

  setExecutionActive(false);
  service.handleProtocolMessage({ method: "turn/completed", params: { threadId: "thread-1" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(compacted, ["thread-1"]);
  assert.equal(service.getStatus("thread-1").phase, "compacting");
});
