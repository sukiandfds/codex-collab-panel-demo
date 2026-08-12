const clean = (value, maxLength = 240) => String(value || "").trim().slice(0, maxLength);

const idleStatus = () => ({
  phase: "idle",
  label: "idle",
  active: false,
  turnId: "",
  updatedAt: null,
  indicator: null,
});

const publicStatus = (value) => {
  const phase = clean(value?.phase, 64) || "idle";
  const label = clean(value?.label, 120) || "idle";
  const occupied = /occupied|busy|locked|占用|锁定/iu.test(`${phase} ${label}`);
  const active = value?.active === true;
  return {
    phase,
    label,
    active,
    ...(value?.turnId ? { turnId: clean(value.turnId, 160) } : { turnId: "" }),
    ...(value?.updatedAt ? { updatedAt: value.updatedAt } : { updatedAt: null }),
    indicator: occupied ? "red" : active ? "green" : null,
  };
};

const latestTimestamp = (values) => values
  .filter(Boolean)
  .map((value) => ({ value, time: Date.parse(value) }))
  .filter((entry) => Number.isFinite(entry.time))
  .sort((left, right) => right.time - left.time)[0]?.value || null;

/**
 * Aggregates the personal project and long-lived employee projects for the
 * sidebar. It intentionally exposes no runtime instructions or internal files.
 */
export const createEmployeeProjectDirectory = ({
  project,
  projectRoot,
  registry,
  projectIdentity,
  employeeRuntime,
  conversations,
  execution,
  employeeConversations,
  roomDirectory,
  personalStatus,
}) => {
  const readEmployeeStatus = async (employeeId) => {
    try {
      const value = await employeeRuntime?.getStatus?.(employeeId);
      return publicStatus(value?.status);
    } catch {
      return idleStatus();
    }
  };

  const employeeLastActivity = async (employee) => {
    const conversationId = clean(employee.conversationId, 120);
    const threadId = clean(employee.mainThreadId, 120);
    const timestamps = [];
    try {
      const messages = conversationId
        ? await employeeConversations?.readMessages?.(conversationId) || []
        : [];
      timestamps.push(...messages
        .filter((message) => message?.role === "user" || message?.role === "assistant")
        .map((message) => message.createdAt));
    } catch {}
    if (threadId) {
      try {
        const nativeSession = await conversations?.findSession?.(threadId, "all", {});
        timestamps.push(nativeSession?.updatedAt);
      } catch {}
    }
    return latestTimestamp(timestamps);
  };

  const groupConversationsFor = async (employee, conversationStatuses) => {
    const rooms = roomDirectory?.listForAgent?.(employee.id) || [];
    const entries = await Promise.all(rooms.map(async (room) => {
      const roomStore = roomDirectory?.get?.(room.id);
      const agent = roomStore?.getAgent?.(employee.id);
      const threadId = clean(agent?.threadId, 120);
      if (!roomStore || !threadId) return null;
      const binding = await employeeConversations?.openGroupForAgent?.({
        agentId: employee.id,
        roomId: room.id,
        projectId: room.projectId,
        threadId,
        title: `${clean(room.name, 200) || "项目群"} · ${clean(agent.name, 120) || employee.name}`,
      });
      if (!binding) return null;
      const messages = roomStore.snapshot().messages
        .filter((message) => message?.type === "agent"
          && (message.agentId === employee.id || message.authorId === employee.id)
          && String(message.text || "").trim());
      const lastActivityAt = latestTimestamp(messages.map((message) => message.createdAt));
      const status = publicStatus(agent);
      const statusKey = clean(binding.runtimeSessionId, 120);
      if (statusKey) conversationStatuses[statusKey] = status;
      return {
        id: binding.conversationId,
        threadId: binding.runtimeSessionId,
        conversationId: binding.conversationId,
        projectId: clean(room.projectId, 200) || null,
        role: "project",
        runtimeKind: binding.runtimeKind,
        runtimeSessionId: binding.runtimeSessionId,
        title: binding.title || `${clean(room.name, 200) || "项目群"} · 员工回复`,
        main: false,
        lastActivityAt,
        status,
      };
    }));
    return entries.filter(Boolean);
  };

  const list = async () => {
    const employees = registry?.list?.() || [];
    try { await projectIdentity?.sync?.(); } catch {}
    const projectIdentities = projectIdentity?.list?.() || [];
    const personalIdentity = projectIdentities.find((item) => item.kind === "personal") || null;
    const businessIdentities = projectIdentities.filter((item) => item.kind === "personal" || item.kind === "business");
    if (!businessIdentities.some((item) => item.kind === "personal")) {
      businessIdentities.unshift({
        projectId: clean(project, 200) || "project",
        key: clean(project, 120) || "project",
        name: clean(project, 160) || "My project",
        kind: "personal",
        root: projectRoot,
        roots: { project: projectRoot },
        provider: "codex",
        runtime: { provider: "codex" },
      });
    }
    const conversationStatuses = {};
    const employeeProjects = await Promise.all(employees.map(async (employee) => {
      const identity = projectIdentity?.getByKey?.("employee", employee.projectKey)
        || projectIdentity?.getForEmployee?.(employee.id)
        || null;
      const boundConversation = identity?.conversation || null;
      const mainConversationId = clean(employee.conversationId || boundConversation?.conversationId, 120) || null;
      const mainThreadId = clean(employee.mainThreadId || boundConversation?.threadId || boundConversation?.runtimeSessionId, 120) || null;
      const status = await readEmployeeStatus(employee.id);
      const statusKey = clean(mainThreadId || mainConversationId, 120);
      const mainLastActivityAt = await employeeLastActivity({ ...employee, conversationId: mainConversationId, mainThreadId });
      const groupConversations = await groupConversationsFor(employee, conversationStatuses);
      const lastActivityAt = latestTimestamp([
        mainLastActivityAt,
        ...groupConversations.map((conversation) => conversation.lastActivityAt),
      ]);
      if (statusKey) conversationStatuses[statusKey] = status;
      const employeeConversationEntries = [
        ...(mainThreadId || mainConversationId ? [{
          id: clean(mainThreadId || mainConversationId, 120),
          threadId: mainThreadId,
          conversationId: mainConversationId,
          projectId: clean(identity?.projectId, 200) || clean(employee.projectKey, 120) || `employee-${employee.id}`,
          role: "main",
          runtimeKind: clean(boundConversation?.runtimeKind || employee.runtimeKind, 80) || "codex",
          runtimeSessionId: clean(boundConversation?.runtimeSessionId || mainThreadId, 200) || null,
          title: "主对话",
          main: true,
          lastActivityAt: mainLastActivityAt,
          status,
        }] : []),
        ...groupConversations,
      ];
      return {
        id: clean(employee.projectKey, 120) || `employee-${employee.id}`,
        projectId: clean(identity?.projectId, 200) || clean(employee.projectKey, 120) || `employee-${employee.id}`,
        name: clean(employee.name, 160) || employee.id,
        kind: "employee",
        root: clean(identity?.root, 400) || clean(employee.projectRoot, 400) || projectRoot,
        roots: identity?.roots || {
          project: clean(employee.projectRoot, 400) || projectRoot,
          context: clean(employee.contextRoot, 400) || null,
        },
        provider: clean(identity?.provider || employee.runtimeKind, 80) || "codex",
        runtime: identity?.runtime || { provider: clean(employee.runtimeKind, 80) || "codex" },
        capabilities: identity?.capabilities || {},
        memberEmployeeIds: identity?.memberEmployeeIds || [clean(employee.id, 80)],
        agentIds: identity?.agentIds || [clean(employee.id, 80)],
        employeeId: clean(employee.id, 80),
        mainConversationId,
        mainThreadId,
        status,
        lastActivityAt,
        conversations: employeeConversationEntries,
      };
    }));
    let sessions = [];
    try { sessions = await conversations?.listSessions?.("all", false) || []; } catch {}
    sessions = await Promise.all(sessions.map(async (session) => {
      if (clean(session?.title, 240) && session.title !== "未命名会话") return session;
      try {
        const detail = await conversations?.findSession?.(session.threadId, "all", { limit: 1 });
        return detail?.title ? { ...session, title: detail.title } : session;
      } catch {
        return session;
      }
    }));
    const employeeThreadIds = new Set([
      ...employees.map((employee) => clean(employee.mainThreadId, 120)),
      ...(roomDirectory?.threadIds?.() || []),
    ].filter(Boolean));
    sessions = sessions.filter((session) => !employeeThreadIds.has(clean(session?.threadId, 120)));
    const sessionStatuses = sessions.map((session) => {
      const threadId = clean(session?.threadId, 120);
      let status = idleStatus();
      try { status = publicStatus(execution?.getStatus?.(threadId)); } catch {}
      if (threadId) conversationStatuses[threadId] = status;
      return status;
    });
    const activeSessionStatus = sessionStatuses.find((status) => status.indicator === "red")
      || sessionStatuses.find((status) => status.indicator === "green");
    const sameRoot = (left, right) => {
      try { return clean(left, 800).toLowerCase() === clean(right, 800).toLowerCase(); } catch { return false; }
    };
    const businessProjects = businessIdentities.map((identity) => {
      const projectSessions = sessions.filter((session) => sameRoot(session?.cwd, identity.root));
      const isPersonal = identity.kind === "personal";
      return {
        id: clean(identity.projectId, 200) || clean(identity.key, 120),
        projectId: clean(identity.projectId, 200) || clean(identity.key, 120),
        name: clean(identity.name, 160) || (isPersonal ? clean(project, 160) : "Business project"),
        kind: identity.kind,
        root: clean(identity.root, 400) || (isPersonal ? projectRoot : ""),
        roots: identity.roots || { project: identity.root },
        provider: clean(identity.provider, 80) || "codex",
        runtime: identity.runtime || { provider: "codex" },
        capabilities: identity.capabilities || {},
        memberEmployeeIds: identity.memberEmployeeIds || [],
        agentIds: identity.agentIds || [],
        status: (isPersonal ? activeSessionStatus : null)
          || publicStatus(typeof personalStatus === "function" ? personalStatus() : personalStatus),
        lastActivityAt: latestTimestamp(projectSessions.map((session) => session?.updatedAt)),
        conversations: projectSessions.map((session) => ({
          id: clean(session?.threadId, 120),
          threadId: clean(session?.threadId, 120),
          projectId: clean(identity.projectId, 200) || clean(identity.key, 120),
          role: "standard",
          runtimeKind: "codex",
          runtimeSessionId: clean(session?.threadId, 120),
          title: clean(session?.title, 240) || "未命名会话",
          updatedAt: session?.updatedAt || null,
          lastActivityAt: session?.updatedAt || null,
          messageCount: Number.isSafeInteger(session?.messageCount) ? session.messageCount : null,
          archived: session?.archived === true,
          status: conversationStatuses[clean(session?.threadId, 120)] || idleStatus(),
        })).filter((conversation) => conversation.threadId),
      };
    });
    const projects = [...businessProjects, ...employeeProjects].sort((left, right) => {
      const leftTime = Date.parse(left.lastActivityAt || "");
      const rightTime = Date.parse(right.lastActivityAt || "");
      if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
      if (!Number.isFinite(leftTime)) return 1;
      if (!Number.isFinite(rightTime)) return -1;
      return rightTime - leftTime;
    });
    return {
      version: 1,
      projects,
      conversationStatuses,
      generatedAt: new Date().toISOString(),
    };
  };

  return { list };
};
