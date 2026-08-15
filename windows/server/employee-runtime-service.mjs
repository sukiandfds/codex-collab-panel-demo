import { randomUUID } from "node:crypto";
import { createAppServerClient } from "./app-server-client.mjs";
import { messagesFromTurns } from "./codex-thread-history.mjs";
import { employeeTurnInstructions } from "./employee-definitions.mjs";
import { CURRENT_MODEL_PROVIDER_ID } from "./model-provider-service.mjs";

const clean = (value, maxLength = 200) => String(value || "").trim().slice(0, maxLength);
const statusError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const isOccupiedError = (error) => error?.statusCode === 409 || /already active|already running|in progress|busy|occupied/iu.test(String(error?.message || error));

const textFromContent = (value) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromContent).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.message === "string") return value.message;
  return textFromContent(value.content);
};

const textFromItem = (item) => item?.type === "agentMessage"
  ? String(item.text || "")
  : textFromContent(item?.content);

const policyFor = (employee) => employee?.modificationConfirmed
  ? { sandbox: "workspace-write", approvalPolicy: "on-request" }
  : { sandbox: "read-only", approvalPolicy: "never" };

const publicMessage = ({ id, role, text, turnId, itemId, createdAt }) => ({
  id: clean(id, 240),
  role: role === "user" ? "user" : "assistant",
  text: String(text || ""),
  ...(turnId ? { turnId: clean(turnId, 160) } : {}),
  ...(itemId ? { itemId: clean(itemId, 160) } : {}),
  createdAt: createdAt || new Date().toISOString(),
});

export const createEmployeeRuntimeService = ({
  registry,
  conversationStore,
  projectRoot,
  broadcast = () => {},
  growthService = null,
  contextProvider = null,
  execution = null,
  onTurnCompleted = null,
  client = null,
  modelProviders = null,
}) => {
  const defaultClient = client || createAppServerClient();
  const ownsDefaultClient = !client;
  const threadEmployees = new Map();
  const threadClients = new Map();
  const clientSubscriptions = new Map();
  const statuses = new Map();
  const openPromises = new Map();
  const sendLocks = new Map();
  const turnInputs = new Map();
  const lastAssistantReplies = new Map();
  let closed = false;

  const subscribeClient = (runtimeClient) => {
    if (!runtimeClient || clientSubscriptions.has(runtimeClient)) return;
    clientSubscriptions.set(runtimeClient, runtimeClient.subscribe(handleProtocolMessage));
  };

  const routeForEmployee = (employee) => modelProviders?.resolveRoute({
    modelProviderId: employee?.modelProviderId || CURRENT_MODEL_PROVIDER_ID,
    model: employee?.model || "",
  }) || {
    modelProviderId: CURRENT_MODEL_PROVIDER_ID,
    model: clean(employee?.model, 120),
  };

  const clientForEmployee = async (employee) => {
    if (!modelProviders) return defaultClient;
    const runtimeClient = await modelProviders.getClient(routeForEmployee(employee));
    subscribeClient(runtimeClient);
    return runtimeClient;
  };

  const clientForThread = async (threadId, employee) => {
    const existing = threadClients.get(threadId);
    if (existing) return existing;
    const runtimeClient = await clientForEmployee(employee);
    threadClients.set(threadId, runtimeClient);
    return runtimeClient;
  };

  for (const employee of registry.list()) {
    rememberInitialThread(employee);
    statuses.set(employee.id, {
      phase: "idle",
      label: employee.modificationConfirmed ? "等待任务" : "等待确认",
      detail: "",
      active: false,
      turnId: "",
      updatedAt: employee.updatedAt || null,
    });
  }

  function rememberInitialThread(employee) {
    const threadId = clean(employee?.mainThreadId, 120);
    if (threadId) threadEmployees.set(threadId, employee.id);
  }

  const statusFor = (employeeId) => statuses.get(employeeId) || {
    phase: "idle",
    label: "等待确认",
    detail: "",
    active: false,
    turnId: "",
    updatedAt: null,
  };

  const publishStatus = (employeeId, patch = {}) => {
    const current = statusFor(employeeId);
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    statuses.set(employeeId, next);
    broadcast({
      type: "employee_status",
      employeeId,
      status: next,
      modificationConfirmed: Boolean(registry.get(employeeId)?.modificationConfirmed),
    });
    const threadId = clean(registry.get(employeeId)?.mainThreadId, 120);
    if (threadId && execution?.publishStatus) {
      execution.publishStatus(threadId, {
        phase: next.phase,
        label: next.label,
        detail: next.detail,
        active: next.active,
        turnId: next.turnId,
      });
    }
    return next;
  };

  const rememberThread = (employeeId, threadId) => {
    const cleanThreadId = clean(threadId, 120);
    if (cleanThreadId) threadEmployees.set(cleanThreadId, employeeId);
    return cleanThreadId;
  };

  const bindConversation = async (employee, threadId) => {
    const current = conversationStore.findByAgentKind?.(employee.id, "direct");
    if (current?.runtimeKind === "codex" && current.runtimeSessionId === threadId) {
      if (employee.mainThreadId !== threadId) await registry.bindMainThread(employee.id, threadId);
      if (current.conversationId !== employee.conversationId) {
        await registry.bindConversation(employee.id, current.conversationId);
      }
      return current;
    }
    const binding = await conversationStore.bindRuntime({
      conversationId: employee.conversationId || "",
      agentId: employee.id,
      runtimeKind: "codex",
      runtimeSessionId: threadId,
      conversationKind: "direct",
    });
    await registry.bindMainThread(employee.id, threadId);
    if (binding.conversationId !== employee.conversationId) {
      await registry.bindConversation(employee.id, binding.conversationId);
    }
    return binding;
  };

  const resumeThread = async (threadId, employee) => {
    const runtimeClient = await clientForThread(threadId, employee);
    return runtimeClient.request("thread/resume", {
      threadId,
      persistExtendedHistory: true,
      ...policyFor(employee),
    });
  };

  const readAuthoritativeStatus = async (threadId, employee) => {
    try {
      const runtimeClient = await clientForThread(threadId, employee);
      const result = await runtimeClient.request("thread/read", { threadId, includeTurns: false });
      const thread = result?.thread || result || {};
      const rawStatus = thread.status || thread.state;
      const active = thread.active === true
        || rawStatus === "active"
        || rawStatus === "inProgress"
        || rawStatus?.type === "active"
        || (Array.isArray(thread.activeFlags) && thread.activeFlags.length > 0)
        || (thread.activeFlags && typeof thread.activeFlags === "object" && Object.keys(thread.activeFlags).length > 0);
      return { known: Boolean(rawStatus || thread.active !== undefined || thread.activeFlags), active };
    } catch {
      return { known: false, active: false };
    }
  };

  const startThread = async (employee) => {
    const runtimeClient = await clientForEmployee(employee);
    const route = routeForEmployee(employee);
    const result = await runtimeClient.request("thread/start", {
      cwd: clean(employee.projectRoot, 400) || projectRoot,
      developerInstructions: employeeTurnInstructions(employee.instructions),
      ephemeral: false,
      serviceName: `negus-${employee.projectKey}`,
      ...(route.model ? { model: route.model } : {}),
      ...policyFor(employee),
    });
    const threadId = clean(result?.thread?.id, 120);
    if (!threadId) throw new Error("Codex 未返回员工主对话");
    rememberThread(employee.id, threadId);
    threadClients.set(threadId, runtimeClient);
    try {
      await runtimeClient.request("thread/name/set", {
        threadId,
        name: `${employee.name} · 长期主对话`,
      });
    } catch {
      // Naming is helpful in Codex, but it is not the Negus identity binding.
    }
    return threadId;
  };

  const ensureOpen = async (employeeId) => {
    if (closed) throw new Error("员工运行时已关闭");
    const employee = registry.require(employeeId);
    const existing = openPromises.get(employee.id);
    if (existing) return existing;
    const opening = (async () => {
      let threadId = clean(employee.mainThreadId, 120);
      const hadExistingThread = Boolean(threadId);
      if (threadId) {
        rememberThread(employee.id, threadId);
        try {
          await resumeThread(threadId, employee);
        } catch (error) {
          if (!/thread.*not found|not found.*thread|会话不存在/iu.test(String(error?.message || error))) throw error;
          threadId = "";
          await registry.bindMainThread(employee.id, "");
        }
      }
      if (!threadId) {
        threadId = await startThread(employee);
      }
      const latest = registry.require(employee.id);
      const binding = await bindConversation(latest, threadId);
      publishStatus(employee.id, {
        phase: "idle",
        label: latest.modificationConfirmed ? "等待任务" : "等待确认",
        detail: "",
        active: false,
        turnId: "",
      });
      if (hadExistingThread) {
        const authoritative = await readAuthoritativeStatus(threadId, registry.require(employee.id));
        if (authoritative.known && authoritative.active) {
          publishStatus(employee.id, { phase: "working", label: "正在处理", detail: "", active: true, turnId: "" });
        }
      }
      return { employee: registry.require(employee.id), binding, threadId };
    })();
    openPromises.set(employee.id, opening);
    try {
      return await opening;
    } finally {
      if (openPromises.get(employee.id) === opening) openPromises.delete(employee.id);
    }
  };

  const readNativeMessages = async (threadId, employee) => {
    const runtimeClient = await clientForThread(threadId, employee);
    const result = await runtimeClient.request("thread/read", { threadId, includeTurns: true });
    return messagesFromTurns(result?.thread?.turns, () => null)
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => publicMessage(message));
  };

  const sessionFor = async (employeeId) => {
    const { employee, binding, threadId } = await ensureOpen(employeeId);
    let messages = await conversationStore.readMessages(binding.conversationId);
    if (!messages.length) {
      try {
        messages = await readNativeMessages(threadId, registry.require(employeeId));
      } catch {
        messages = [];
      }
    }
    return {
      employee: registry.get(employee.id),
      project: {
        key: employee.projectKey,
        root: employee.projectRoot,
        runtime: employee.runtimeKind,
      },
      conversation: {
        id: binding.conversationId,
        kind: "main",
        runtimeKind: binding.runtimeKind,
        runtimeSessionId: binding.runtimeSessionId,
        threadId: binding.runtimeKind === "codex" ? binding.runtimeSessionId : null,
      },
      status: statusFor(employee.id),
      messages: messages.map(publicMessage),
    };
  };

  const readSession = async (employeeId, pagination = {}) => {
    const session = await sessionFor(employeeId);
    const allMessages = session.messages;
    const end = Math.min(Number.isSafeInteger(pagination.before) ? pagination.before : allMessages.length, allMessages.length);
    const start = pagination.limit ? Math.max(0, end - pagination.limit) : 0;
    const messages = allMessages.slice(start, end);
    const latest = allMessages.at(-1);
    return {
      threadId: session.conversation.threadId,
      source: "codex",
      title: `${session.employee.name} · 主对话`,
      updatedAt: latest?.createdAt || session.employee.updatedAt || "",
      messageCount: allMessages.length,
      latestUser: [...allMessages].reverse().find((message) => message.role === "user")?.text || "",
      latestAssistant: [...allMessages].reverse().find((message) => message.role === "assistant")?.text || "",
      archived: false,
      conversationKind: "direct",
      messages,
      hasMore: start > 0,
      nextBefore: start || null,
      nextCursor: null,
      conversationId: session.conversation.id,
    };
  };

  const handleProtocolMessage = (message) => {
    const threadId = clean(message?.params?.threadId, 120);
    const employeeId = threadEmployees.get(threadId);
    if (!employeeId) return;
    const params = message.params || {};
    const method = message.method || "";

    if (method === "turn/started") {
      publishStatus(employeeId, {
        phase: "working",
        label: "正在处理",
        detail: "",
        active: true,
        turnId: clean(params.turnId || params.turn?.id, 160),
      });
      return;
    }
    if (method === "turn/completed") {
      const status = String(params.turn?.status || "completed");
      const turnId = clean(params.turnId || params.turn?.id || statusFor(employeeId).turnId, 160);
      const error = String(params.turn?.error?.message || "");
      publishStatus(employeeId, {
        phase: status === "failed" ? "failed" : status === "interrupted" ? "interrupted" : "idle",
        label: status === "failed" ? "执行失败" : status === "interrupted" ? "已中断" : "等待任务",
        detail: error,
        active: false,
        turnId: "",
      });
      const completion = { employeeId, threadId, turnId, status, error };
      broadcast({ type: "employee_turn_completed", ...completion });
      if (typeof onTurnCompleted === "function") {
        void Promise.resolve(onTurnCompleted(completion))
          .catch((cause) => console.warn(`[employee-runtime] completion listener failed: ${String(cause?.message || cause)}`));
      }
      if (status === "completed" && growthService) {
        void growthService.reviewTask({
          employeeId,
          threadId,
          turnId,
          taskText: turnInputs.get(employeeId) || "",
          replyText: lastAssistantReplies.get(threadId) || "",
        }).catch(() => {});
      }
      return;
    }
    if (method === "item/agentMessage/delta") {
      const deltaEvent = {
        type: "employee_assistant_delta",
        employeeId,
        threadId,
        turnId: clean(params.turnId, 160),
        itemId: clean(params.itemId || params.item?.id, 160),
        delta: String(params.delta || params.text || ""),
      };
      broadcast(deltaEvent);
      execution?.publishThreadEvent?.(threadId, {
        type: "assistant_delta",
        threadId,
        turnId: deltaEvent.turnId,
        itemId: deltaEvent.itemId,
        delta: deltaEvent.delta,
      });
      return;
    }
    if (method === "item/completed") {
      const item = params.item;
      if (!item || !["userMessage", "agentMessage"].includes(item.type)) return;
      if (item.type === "agentMessage" && item.phase && item.phase !== "final_answer") return;
      void conversationStore.recordRuntimeEvent(message).catch(() => {});
      const text = textFromItem(item);
      if (!text.trim()) return;
      const role = item.type === "agentMessage" ? "assistant" : "user";
      if (role === "assistant") lastAssistantReplies.set(threadId, text);
      broadcast({
        type: "employee_message_completed",
        employeeId,
        threadId,
        message: publicMessage({
          id: item.id || `${params.turnId || "turn"}:${role}:${text}`,
          role,
          text,
          turnId: params.turnId || item.turnId,
          itemId: item.id,
        }),
      });
      execution?.publishThreadEvent?.(threadId, { type: "sessions_changed", threadId });
      return;
    }
    if (method.endsWith("/requestApproval")) {
      publishStatus(employeeId, {
        phase: "waitingOnApproval",
        label: "等待原生审批",
        detail: "",
        active: true,
      });
      return;
    }
    if (method === "item/tool/requestUserInput" || method === "mcpServer/elicitation/request") {
      publishStatus(employeeId, {
        phase: "waitingOnUserInput",
        label: "等待补充信息",
        detail: "",
        active: true,
      });
    }
  };

  subscribeClient(defaultClient);

  const sendMessage = async ({ employeeId, text, requestId = "" }) => {
    const employee = registry.require(employeeId);
    const cleanText = String(text || "").trim();
    if (!cleanText) throw statusError("消息不能为空", 400);
    if (cleanText.length > 32000) throw statusError("消息过长", 413);
    const cleanRequestId = clean(requestId, 120) || randomUUID();
    if (sendLocks.has(employee.id)) throw statusError("员工正在处理上一条消息", 409);
    const { binding, threadId } = await ensureOpen(employee.id);
    if (statusFor(employee.id).active) throw statusError("员工正在处理上一条消息", 409);
    const sending = (async () => {
      publishStatus(employee.id, {
        phase: "submitted",
        label: "已提交",
        detail: employee.modificationConfirmed ? "" : "当前为只读讨论",
        active: true,
        turnId: "",
      });
      try {
        await resumeThread(threadId, registry.require(employee.id));
        const context = await contextProvider?.(employee.id);
        const runtimeClient = await clientForThread(threadId, registry.require(employee.id));
        const result = await runtimeClient.request("turn/start", {
          threadId,
          input: [{ type: "text", text: cleanText, text_elements: [] }],
          cwd: clean(employee.projectRoot, 400) || projectRoot,
          developerInstructions: employeeTurnInstructions(
            employee.instructions,
            context && runtimeClient.turnDeveloperInstructions === true ? context : "",
          ),
        });
        const currentStatus = statusFor(employee.id);
        if (currentStatus.active && ["submitted", "working"].includes(currentStatus.phase)) {
          publishStatus(employee.id, {
            phase: "working",
            label: "正在处理",
            active: true,
            turnId: clean(result?.turn?.id, 160),
          });
        }
        return {
          requestId: cleanRequestId,
          employeeId: employee.id,
          conversationId: binding.conversationId,
          threadId,
          status: "inProgress",
          turnId: clean(result?.turn?.id, 160),
        };
      } catch (error) {
        publishStatus(employee.id, {
          phase: isOccupiedError(error) ? "occupied" : "failed",
          label: isOccupiedError(error) ? "被占用中" : "提交失败",
          detail: String(error?.message || error),
          active: isOccupiedError(error),
          turnId: "",
        });
        throw error;
      }
    })();
    turnInputs.set(employee.id, cleanText);
    sendLocks.set(employee.id, sending);
    try {
      return await sending;
    } finally {
      if (sendLocks.get(employee.id) === sending) sendLocks.delete(employee.id);
    }
  };

  const confirmModification = async (employeeId) => {
    const employee = registry.require(employeeId);
    const { threadId } = await ensureOpen(employee.id);
    if (statusFor(employee.id).active) throw statusError("员工正在处理消息，请完成后再确认", 409);
    const runtimeClient = await clientForThread(threadId, employee);
    await runtimeClient.request("thread/resume", {
      threadId,
      persistExtendedHistory: true,
      sandbox: "workspace-write",
      approvalPolicy: "on-request",
    });
    const confirmed = await registry.setModificationConfirmed(employee.id, true);
    publishStatus(employee.id, {
      phase: "idle",
      label: "等待任务",
      detail: "已允许进入修改流程",
      active: false,
      turnId: "",
    });
    broadcast({ type: "employee_confirmation_changed", employeeId: employee.id, modificationConfirmed: true });
    return { employee: confirmed, status: statusFor(employee.id) };
  };

  const getStatus = async (employeeId) => {
    const employee = registry.require(employeeId);
    return {
      employee: registry.get(employee.id),
      status: statusFor(employee.id),
      modificationConfirmed: Boolean(employee.modificationConfirmed),
      threadId: clean(employee.mainThreadId, 120) || null,
      conversationId: clean(employee.conversationId, 120) || null,
    };
  };

  const updateModelSettings = async (employeeId, settings = {}) => {
    const employee = registry.require(employeeId);
    if (statusFor(employee.id).active) throw statusError("员工正在处理消息，不能修改模型", 409);
    const requestedModel = Object.prototype.hasOwnProperty.call(settings, "model")
      ? clean(settings.model, 120)
      : clean(employee.model, 120);
    const explicitProviderId = clean(settings.modelProviderId, 80);
    const requestedProviderId = requestedModel && modelProviders && !explicitProviderId
      ? ""
      : explicitProviderId || clean(employee.modelProviderId, 80) || CURRENT_MODEL_PROVIDER_ID;
    if (!modelProviders && requestedProviderId !== CURRENT_MODEL_PROVIDER_ID) {
      throw statusError("当前员工运行时未启用外部模型供应商", 503);
    }
    const requestedRoute = modelProviders?.resolveRoute({
      modelProviderId: requestedProviderId,
      model: requestedModel,
    }) || {
      modelProviderId: CURRENT_MODEL_PROVIDER_ID,
      model: clean(settings.model, 120),
    };
    const currentRoute = routeForEmployee(employee);
    if (employee.mainThreadId && currentRoute.modelProviderId !== requestedRoute.modelProviderId) {
      throw statusError("现有员工 Thread 暂不支持跨供应商切换；请为新 Thread 选择该模型", 409);
    }
    const runtimeClient = modelProviders
      ? await modelProviders.getClient(requestedRoute)
      : defaultClient;
    subscribeClient(runtimeClient);
    const reasoningEffort = Object.prototype.hasOwnProperty.call(settings, "reasoningEffort")
      ? clean(settings.reasoningEffort, 40)
      : clean(employee.reasoningEffort, 40);
    if (employee.mainThreadId) {
      threadClients.set(employee.mainThreadId, runtimeClient);
      await resumeThread(employee.mainThreadId, employee);
      if (requestedRoute.model && requestedRoute.model !== currentRoute.model) {
        await runtimeClient.request("thread/settings/update", {
          threadId: employee.mainThreadId,
          model: requestedRoute.model,
        });
      }
      if (reasoningEffort && reasoningEffort !== clean(employee.reasoningEffort, 40)) {
        await runtimeClient.request("thread/settings/update", {
          threadId: employee.mainThreadId,
          effort: reasoningEffort,
        });
      }
    }
    const updated = await registry.setModelSettings(employee.id, {
      modelProviderId: requestedRoute.modelProviderId,
      model: requestedRoute.model,
      reasoningEffort,
    });
    return { employee: updated, status: statusFor(employee.id) };
  };

  const runtimeContextForThread = async (threadId) => {
    const cleanThreadId = clean(threadId, 120);
    const employeeId = threadEmployees.get(cleanThreadId);
    if (!employeeId) throw statusError("员工 Thread 不存在", 404);
    const employee = registry.require(employeeId);
    const runtimeClient = await clientForThread(cleanThreadId, employee);
    const result = await runtimeClient.request("thread/resume", {
      threadId: cleanThreadId,
      persistExtendedHistory: true,
      ...policyFor(employee),
    });
    return {
      model: result?.model || employee.model || "",
      modelProvider: result?.modelProvider || employee.modelProviderId || CURRENT_MODEL_PROVIDER_ID,
      reasoningEffort: result?.reasoningEffort || employee.reasoningEffort || "",
    };
  };

  const threadStatus = async (threadId) => {
    const cleanThreadId = clean(threadId, 120);
    const employeeId = threadEmployees.get(cleanThreadId);
    if (!employeeId) throw statusError("员工 Thread 不存在", 404);
    const runtimeClient = await clientForThread(cleanThreadId, registry.require(employeeId));
    const request = runtimeClient.probe?.bind(runtimeClient) || runtimeClient.request.bind(runtimeClient);
    const result = await request("thread/read", { threadId: cleanThreadId, includeTurns: false }, {
      timeoutMs: 5000,
      threadId: cleanThreadId,
    });
    return result?.thread?.status || null;
  };

  const compactContext = async (threadId) => {
    const cleanThreadId = clean(threadId, 120);
    const employeeId = threadEmployees.get(cleanThreadId);
    if (!employeeId) throw statusError("员工 Thread 不存在", 404);
    const runtimeClient = await clientForThread(cleanThreadId, registry.require(employeeId));
    await resumeThread(cleanThreadId, registry.require(employeeId));
    return runtimeClient.request("thread/compact/start", { threadId: cleanThreadId });
  };

  const interrupt = async (employeeId, expectedTurnId = "") => {
    const employee = registry.require(employeeId);
    const current = statusFor(employee.id);
    const expected = clean(expectedTurnId, 160);
    if (expected && (!current.active || !current.turnId)) {
      throw statusError("Goal 对应任务已不在运行，请刷新后重试", 409);
    }
    if (expected && current.turnId !== expected) {
      throw statusError("员工当前任务不属于这个 Goal，已拒绝中断", 409);
    }
    if (!current.active || !current.turnId) return { employeeId: employee.id, status: "idle" };
    const { threadId } = await ensureOpen(employee.id);
    const runtimeClient = await clientForThread(threadId, employee);
    await runtimeClient.request("turn/interrupt", { threadId, turnId: current.turnId });
    publishStatus(employee.id, {
      phase: "interrupted",
      label: "已中断",
      detail: "Goal 已暂停或停止当前执行",
      active: false,
      turnId: current.turnId,
    });
    return { employeeId: employee.id, threadId, turnId: current.turnId, status: "interrupted" };
  };

  const close = () => {
    closed = true;
    for (const unsubscribe of clientSubscriptions.values()) unsubscribe?.();
    clientSubscriptions.clear();
    if (ownsDefaultClient) defaultClient.close();
  };

  return {
    open: sessionFor,
    readSession,
    sendMessage,
    confirmModification,
    getStatus,
    updateModelSettings,
    getRuntimeContext: runtimeContextForThread,
    getThreadStatus: threadStatus,
    compactContext,
    interrupt,
    supportsEmployee: (employeeId) => Boolean(registry.get(employeeId)),
    ownsConversation: (binding) => {
      const employee = registry.get(binding?.agentId);
      return Boolean(
        employee
          && clean(employee.conversationId, 120) === clean(binding?.conversationId, 120)
          && clean(employee.mainThreadId, 120) === clean(binding?.runtimeSessionId, 120),
      );
    },
    ownsThread: (threadId) => threadEmployees.has(clean(threadId, 120)),
    close,
  };
};
