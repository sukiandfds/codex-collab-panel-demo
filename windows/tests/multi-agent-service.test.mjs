import assert from "node:assert/strict";
import test from "node:test";
import { buildDiscussionPrompt, createMultiAgentService, mentionedAgentIds, newMentionedAgentIds } from "../server/multi-agent-service.mjs";
import { resolveAgentRouting } from "../server/multi-agent/agent-routing.mjs";

const agents = [
  { id: "manager", name: "Manager Agent", aliases: ["Manager"], responsibility: "coordination" },
  { id: "reviewer", name: "Reviewer Agent", aliases: ["Reviewer"], responsibility: "risk review" },
];

test("finds every mentioned Agent in message order", () => {
  assert.deepEqual(
    mentionedAgentIds("Ask @Reviewer Agent, then @Manager Agent", agents),
    ["reviewer", "manager"],
  );
  assert.deepEqual(mentionedAgentIds("@Reviewer Agent then @Reviewer Agent", agents), ["reviewer"]);
});

test("an empty explicit Agent list still resolves mentions from text", () => {
  assert.deepEqual(resolveAgentRouting({
    text: "Please continue, @Reviewer Agent",
    requestedAgentIds: ["manager"],
    explicitAgentIds: [],
    agents,
  }).targetAgentIds, ["reviewer"]);
});

test("matches aliases and ignores incomplete or longer names", () => {
  assert.deepEqual(mentionedAgentIds("Ask @Reviewer, then @Manager Agent", agents), ["reviewer", "manager"]);
  assert.deepEqual(mentionedAgentIds("@ReviewerAgent should not match", agents), []);
  assert.deepEqual(mentionedAgentIds("@Manager Agent", [{ ...agents[0], name: "Manager", aliases: [] }, agents[1]]), ["manager"]);
});

test("returns only newly mentioned employees for the current round", () => {
  assert.deepEqual(
    newMentionedAgentIds("Please continue, @Reviewer Agent", agents, new Set(["manager"])),
    ["reviewer"],
  );
  assert.deepEqual(
    newMentionedAgentIds("No handoff needed", agents, new Set(["manager"])),
    [],
  );
});

test("does not awaken an employee twice in the same round", () => {
  assert.deepEqual(
    newMentionedAgentIds("@Manager Agent please revisit this", agents, new Set(["manager", "reviewer"])),
    [],
  );
});

test("discussion prompt contains only the new public room context", () => {
  const prompt = buildDiscussionPrompt({
    agent: agents[1],
    agents,
    messages: [{ type: "human", authorName: "Hans", text: "Check the current plan" }],
  });

  assert.match(prompt, /Check the current plan/u);
  assert.match(prompt, /\[Hans\] Check the current plan/u);
  assert.match(prompt, /@Manager Agent/u);
  assert.doesNotMatch(prompt, /@Reviewer Agent/u);
  assert.match(prompt, /只能以自己的身份回复/u);
  assert.match(prompt, /不得代替其他员工发言/u);
  assert.match(prompt, /系统会在你回复后调用被提及的员工/u);
  assert.match(prompt, /本轮新增群聊消息/u);
  assert.doesNotMatch(prompt, /Your public role|hidden thinking|private reasoning/u);
});

test("reuses one persistent Runtime thread for an employee in a group", async () => {
  const requests = [];
  let agent = {
    ...agents[0],
    threadId: null,
    instructions: "stable employee rules",
    model: "gpt-test",
    reasoningEffort: "medium",
  };
  const client = {
    request: async (method, params) => {
      requests.push({ method, params });
      if (method === "thread/start") return { thread: { id: "group-thread-manager" } };
      if (method === "thread/resume") return { thread: { id: params.threadId } };
      return {};
    },
    subscribe: () => () => {},
    close: () => {},
  };
  const room = {
    snapshot: () => ({ agents: [agent] }),
    getAgent: () => agent,
    updateAgent: async (_agentId, patch) => { agent = { ...agent, ...patch }; return agent; },
  };
  const service = createMultiAgentService({
    projectRoot: "D:\\project",
    employeeWorkRoots: { manager: "D:\\employees\\manager" },
    room,
    broadcast: () => {},
    appServerClient: client,
  });

  const first = await service.ensureAgentThread("manager");
  const second = await service.ensureAgentThread("manager");
  service.close();

  assert.equal(first, "group-thread-manager");
  assert.equal(second, first);
  assert.equal(requests.filter((item) => item.method === "thread/start").length, 1);
  assert.equal(requests.find((item) => item.method === "thread/start").params.ephemeral, false);
  assert.equal(requests.filter((item) => item.method === "thread/resume").length, 1);
});

test("interrupts the active group Turn and cancels the remaining employees", async () => {
  const requests = [];
  let protocolHandler = () => {};
  const roomAgents = agents.map((agent) => ({
    ...agent,
    threadId: null,
    instructions: "stable employee rules",
    model: "gpt-test",
    reasoningEffort: "medium",
    active: false,
  }));
  const messages = [];
  const deliveredContexts = [];
  const client = {
    request: async (method, params) => {
      requests.push({ method, params });
      if (method === "thread/start") return { thread: { id: `group-thread-${params.cwd.endsWith("manager") ? "manager" : "reviewer"}` } };
      if (method === "turn/start") return { turn: { id: "turn-manager" } };
      return {};
    },
    subscribe: (handler) => { protocolHandler = handler; return () => {}; },
    close: () => {},
  };
  const room = {
    snapshot: () => ({ agents: roomAgents }),
    getAgent: (agentId) => roomAgents.find((agent) => agent.id === agentId),
    updateAgent: async (agentId, patch) => {
      const index = roomAgents.findIndex((agent) => agent.id === agentId);
      roomAgents[index] = { ...roomAgents[index], ...patch };
      return roomAgents[index];
    },
    getAgentContext: () => ({ messages: [{ type: "human", authorName: "Hans", text: "检查问题" }], throughSequence: 1 }),
    addMessage: async (message) => { messages.push(message); return { ...message, id: `message-${messages.length}` }; },
    advanceAgentContext: async () => {},
    beginAgentWork: () => {},
    finishAgentWork: () => {},
  };
  const service = createMultiAgentService({
    projectRoot: "D:\\project",
    employeeWorkRoots: { manager: "D:\\employees\\manager", reviewer: "D:\\employees\\reviewer" },
    room,
    broadcast: () => {},
    appServerClient: client,
    onContextDelivered: async (delivery) => deliveredContexts.push(delivery),
  });

  await service.enqueueDiscussion({ agentIds: ["manager", "reviewer"], requestText: "检查问题" });
  while (!requests.some((request) => request.method === "turn/start")) await new Promise((resolve) => setImmediate(resolve));
  const stopped = await service.interruptDiscussion();
  protocolHandler({ method: "turn/completed", params: { threadId: "group-thread-manager", turn: { id: "turn-manager", status: "interrupted" } } });
  await new Promise((resolve) => setImmediate(resolve));
  service.close();

  assert.deepEqual(requests.find((request) => request.method === "turn/interrupt"), {
    method: "turn/interrupt",
    params: { threadId: "group-thread-manager", turnId: "turn-manager" },
  });
  assert.equal(requests.filter((request) => request.method === "thread/start").length, 1);
  assert.equal(stopped.cancelledDiscussionCount, 1);
  assert.equal(messages.some((message) => message.text === "您终止了本次任务。"), true);
  assert.deepEqual(deliveredContexts[0].messages.map((message) => message.text), ["检查问题"]);
});

test("a new group Agent Thread uses its provider and rejects a later cross-provider switch", async () => {
  const currentRequests = [];
  const grokRequests = [];
  const client = (requests, threadId) => ({
    subscribe: () => () => {},
    close: () => {},
    request: async (method, params) => {
      requests.push({ method, params });
      if (method === "thread/start") return { thread: { id: threadId } };
      if (method === "thread/resume") return { thread: { id: params.threadId } };
      return {};
    },
  });
  const currentClient = client(currentRequests, "group-current-thread");
  const grokClient = client(grokRequests, "group-grok-thread");
  let agent = {
    ...agents[0],
    threadId: null,
    instructions: "stable employee rules",
    modelProviderId: "fusheng-grok",
    model: "grok-4.6",
    reasoningEffort: "",
  };
  const room = {
    snapshot: () => ({ agents: [agent] }),
    getAgent: () => agent,
    updateAgent: async (_agentId, patch) => { agent = { ...agent, ...patch }; return agent; },
  };
  const modelProviders = {
    resolveRoute: ({ modelProviderId = "", model = "" }) => ({
      modelProviderId: modelProviderId || (model === "grok-4.6" ? "fusheng-grok" : "current"),
      model,
    }),
    getClient: async (route) => route.modelProviderId === "fusheng-grok" ? grokClient : currentClient,
  };
  const service = createMultiAgentService({
    projectRoot: "D:\\project",
    employeeWorkRoots: { manager: "D:\\employees\\manager" },
    room,
    broadcast: () => {},
    appServerClient: currentClient,
    modelProviders,
  });

  assert.equal(await service.ensureAgentThread("manager"), "group-grok-thread");
  assert.equal(currentRequests.some((request) => request.method === "thread/start"), false);
  assert.equal(grokRequests.find((request) => request.method === "thread/start").params.model, "grok-4.6");
  await assert.rejects(
    () => service.updateAgentSettings("manager", {
      modelProviderId: "current",
      model: "gpt-5.6-terra",
      reasoningEffort: "low",
    }),
    /跨供应商/u,
  );
  assert.equal(agent.modelProviderId, "fusheng-grok");
  service.close();
});
