import fs from "node:fs/promises";
import path from "node:path";

const clean = (value, maxLength = 400) => String(value ?? "").trim().slice(0, maxLength);
const clone = (value) => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();

const slug = (value) => clean(value, 120)
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80) || "project";

const readState = async (stateFile) => {
  try {
    const value = JSON.parse(await fs.readFile(stateFile, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
};

const asList = (value) => Array.isArray(value)
  ? [...new Set(value.map((item) => clean(item, 160)).filter(Boolean))]
  : [];

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const comparableConversation = (value) => {
  const normalized = normalizeConversation(value);
  if (!normalized) return null;
  const { boundAt, ...stable } = normalized;
  return stable;
};

const mergeCapabilities = (existing = {}, incoming = {}) => {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = value && typeof value === "object" && !Array.isArray(value)
      ? { ...(existing[key] || {}), ...value }
      : value;
  }
  return merged;
};

const projectIdFor = (kind, key) => `project:${kind}:${slug(key)}`;

const normalizeConversation = (value = {}) => {
  value ||= {};
  const conversationId = clean(value.conversationId, 160) || null;
  const runtimeKind = clean(value.runtimeKind, 80) || null;
  const runtimeSessionId = clean(value.runtimeSessionId, 200) || null;
  const threadId = clean(value.threadId || (runtimeKind === "codex" ? runtimeSessionId : ""), 200) || null;
  if (!conversationId && !runtimeSessionId && !threadId) return null;
  return {
    role: "main",
    conversationId,
    runtimeKind,
    runtimeSessionId,
    threadId,
    ...(value.boundAt ? { boundAt: value.boundAt } : {}),
  };
};

const normalizeCapabilities = (value, kind) => {
  const defaults = kind === "employee"
    ? {
      identity: { enabled: true, source: "employee-project-registry", key: "employeeId" },
      directConversation: { enabled: true, source: "employee-conversation-store", key: "employeeId" },
      localHistory: { enabled: true, source: "employee-conversation-store", key: "employeeId" },
      growth: { enabled: true, source: "employee-growth-store", key: "employeeId" },
      permissions: { enabled: true, source: "employee-project-registry", key: "modificationConfirmed" },
      status: { enabled: true, source: "employee-runtime-service", key: "employeeId" },
      groupPublication: { enabled: true, source: "agent-publication-service", key: "employeeId" },
      subagents: { enabled: true, source: "runtime-adapter", key: "provider" },
    }
    : {
      identity: { source: "project-directory", key: "projectId" },
      growth: { enabled: false, source: null, key: null },
      permissions: { source: "execution-tracker", key: "projectId" },
      status: { source: "execution-tracker", key: "projectId" },
    };
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  // Keep saved extension keys while ensuring the built-in references remain.
  return {
    ...defaults,
    ...clone(value),
  };
};

const normalizeProject = (value = {}) => {
  const kind = clean(value.kind, 40) || "personal";
  const key = clean(value.key || value.projectKey, 160) || "project";
  const projectId = clean(value.projectId, 200) || projectIdFor(kind, key);
  const root = clean(value.root || value.projectRoot, 800) || null;
  const roots = value.roots && typeof value.roots === "object" && !Array.isArray(value.roots)
    ? { ...value.roots }
    : {};
  if (root && !roots.project) roots.project = root;
  return {
    projectId,
    kind,
    key,
    name: clean(value.name, 240) || key,
    ...(clean(value.employeeId, 120) ? { employeeId: clean(value.employeeId, 120) } : {}),
    // These arrays intentionally model many-to-many membership. employeeId is
    // retained above as a compatibility shortcut for current employee rows.
    memberEmployeeIds: asList(value.memberEmployeeIds || (value.employeeId ? [value.employeeId] : [])),
    agentIds: asList(value.agentIds || (value.employeeId ? [value.employeeId] : [])),
    provider: clean(value.provider || value.runtime?.provider || value.runtimeKind, 80) || null,
    runtime: value.runtime && typeof value.runtime === "object" && !Array.isArray(value.runtime)
      ? { ...value.runtime, provider: clean(value.runtime.provider || value.provider || value.runtimeKind, 80) || null }
      : { provider: clean(value.provider || value.runtimeKind, 80) || null },
    root,
    roots,
    capabilities: normalizeCapabilities(value.capabilities, kind),
    metadata: value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata)
      ? clone(value.metadata)
      : {},
    conversation: normalizeConversation(value.conversation || value.mainConversation),
    createdAt: value.createdAt || now(),
    updatedAt: value.updatedAt || value.createdAt || now(),
  };
};

const employeeProject = (employee) => {
  const employeeId = clean(employee?.id, 120);
  const key = clean(employee?.projectKey, 160) || `employee-${employeeId}`;
  const root = clean(employee?.projectRoot, 800) || null;
  const contextRoot = clean(employee?.contextRoot, 800) || null;
  const runtimeKind = clean(employee?.runtimeKind, 80) || "codex";
  const conversation = normalizeConversation({
    conversationId: employee?.conversationId,
    runtimeKind,
    runtimeSessionId: employee?.mainThreadId,
    threadId: employee?.mainThreadId,
  });
  return {
    kind: "employee",
    key,
    name: clean(employee?.name, 240) || employeeId,
    employeeId,
    memberEmployeeIds: employeeId ? [employeeId] : [],
    agentIds: employeeId ? [employeeId] : [],
    provider: runtimeKind,
    runtime: { provider: runtimeKind },
    root,
    roots: {
      project: root,
      context: contextRoot,
    },
    capabilities: {
      identity: { enabled: true, source: "employee-project-registry", key: employeeId },
      directConversation: { enabled: true, source: "employee-conversation-store", key: employeeId },
      localHistory: { enabled: true, source: "employee-conversation-store", key: employeeId },
      growth: { enabled: true, source: "employee-growth-store", key: employeeId },
      permissions: { enabled: true, source: "employee-project-registry", key: "modificationConfirmed" },
      status: { enabled: true, source: "employee-runtime-service", key: employeeId },
      groupPublication: { enabled: true, source: "agent-publication-service", key: employeeId },
      subagents: { enabled: true, source: "runtime-adapter", key: "provider" },
    },
    metadata: {
      shortName: clean(employee?.shortName, 120) || null,
      responsibility: clean(employee?.responsibility, 500) || null,
    },
    conversation,
  };
};

const personalProject = ({ project, projectRoot }) => ({
  kind: "personal",
  key: clean(project, 160) || "project",
  name: clean(project, 240) || "My project",
  memberEmployeeIds: [],
  agentIds: [],
  provider: "codex",
  runtime: { provider: "codex" },
  root: clean(projectRoot, 800) || null,
  roots: { project: clean(projectRoot, 800) || null },
  capabilities: {
    identity: { enabled: true, source: "project-directory", key: "projectId" },
    directConversation: { enabled: false, source: null, key: null },
    localHistory: { enabled: true, source: "conversation-store", key: "projectId" },
    growth: { enabled: false, source: null, key: null },
    permissions: { enabled: true, source: "execution-tracker", key: "projectId" },
    status: { enabled: true, source: "execution-tracker", key: "projectId" },
    groupPublication: { enabled: false, source: null, key: null },
    subagents: { enabled: true, source: "runtime-adapter", key: "provider" },
  },
  metadata: {},
  conversation: null,
});

const mergeProject = (existing, incoming) => {
  const base = normalizeProject(existing || incoming);
  const incomingConversation = incoming.conversation || base.conversation;
  const sameConversation = sameJson(comparableConversation(base.conversation), comparableConversation(incomingConversation));
  const next = normalizeProject({
    ...base,
    ...incoming,
    projectId: base.projectId,
    createdAt: base.createdAt,
    roots: { ...base.roots, ...(incoming.roots || {}) },
    runtime: { ...base.runtime, ...(incoming.runtime || {}) },
    memberEmployeeIds: asList([...base.memberEmployeeIds, ...asList(incoming.memberEmployeeIds)]),
    agentIds: asList([...base.agentIds, ...asList(incoming.agentIds)]),
    metadata: { ...base.metadata, ...(incoming.metadata || {}) },
    conversation: sameConversation ? base.conversation : incomingConversation,
    // Preserve custom capability references, while refreshing known roots and
    // current conversation binding from the authoritative employee registry.
    capabilities: mergeCapabilities(base.capabilities, incoming.capabilities || {}),
  });
  if (sameJson({ ...base, updatedAt: null }, { ...next, updatedAt: null })) return base;
  next.updatedAt = now();
  return next;
};

export const createProjectIdentityStore = async ({
  stateFile,
  project,
  projectRoot,
  registry = null,
}) => {
  if (!stateFile) throw new Error("Project identity state file is required.");
  const stored = await readState(stateFile);
  const projects = new Map();
  for (const raw of Array.isArray(stored.projects) ? stored.projects : []) {
    const value = normalizeProject(raw);
    if (value.projectId) projects.set(value.projectId, value);
  }
  let writeQueue = Promise.resolve();
  const persist = () => {
    const payload = JSON.stringify({ version: 1, projects: [...projects.values()] }, null, 2);
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      const temporary = `${stateFile}.${process.pid}.tmp`;
      await fs.writeFile(temporary, `${payload}\n`, "utf8");
      await fs.rename(temporary, stateFile);
    });
    return writeQueue;
  };

  const findExisting = (incoming) => {
    const byKey = [...projects.values()].find((item) => item.kind === incoming.kind && item.key === incoming.key);
    if (byKey) return byKey;
    const employeeId = clean(incoming.employeeId, 120);
    if (employeeId) {
      const byEmployee = [...projects.values()].filter((item) => item.kind === "employee"
        && (item.employeeId === employeeId || item.memberEmployeeIds.includes(employeeId)));
      if (byEmployee.length === 1) return byEmployee[0];
    }
    if (incoming.kind === "personal") return [...projects.values()].find((item) => item.kind === "personal") || null;
    return null;
  };

  const upsert = (incoming) => {
    const current = findExisting(incoming);
    const value = mergeProject(current, incoming);
    projects.set(value.projectId, value);
    return value;
  };

  const sync = async () => {
    const incoming = [personalProject({ project, projectRoot })];
    for (const employee of registry?.list?.() || []) incoming.push(employeeProject(employee));
    const before = [...projects.values()];
    const synced = incoming.map(upsert);
    if (!sameJson(before, [...projects.values()])) await persist();
    return synced.map(clone);
  };

  const list = () => [...projects.values()].map(clone);
  const get = (projectId) => {
    const value = projects.get(clean(projectId, 200));
    return value ? clone(value) : null;
  };
  const getForEmployee = (employeeId) => {
    return listForEmployee(employeeId)[0] || null;
  };
  const listForEmployee = (employeeId) => {
    const id = clean(employeeId, 120);
    return [...projects.values()]
      .filter((item) => item.kind === "employee"
        && (item.employeeId === id || item.memberEmployeeIds.includes(id)))
      .map(clone);
  };
  const getByKey = (kind, key) => {
    const value = [...projects.values()].find((item) => item.kind === clean(kind, 40) && item.key === clean(key, 160));
    return value ? clone(value) : null;
  };

  const bindMainConversation = async ({
    projectId = "",
    employeeId = "",
    conversationId = "",
    runtimeKind = "codex",
    runtimeSessionId = "",
    threadId = "",
  } = {}) => {
    let current = projectId ? projects.get(clean(projectId, 200)) : null;
    if (!current && employeeId) {
      const matches = listForEmployee(employeeId);
      if (matches.length > 1) throw Object.assign(new Error("Project identity is ambiguous for employee."), { statusCode: 409 });
      if (matches.length === 1) current = projects.get(matches[0].projectId);
    }
    if (!current) throw Object.assign(new Error("Project identity does not exist."), { statusCode: 404 });
    const next = normalizeProject({
      ...current,
      conversation: {
        role: "main",
        conversationId: clean(conversationId, 160) || null,
        runtimeKind: clean(runtimeKind, 80) || null,
        runtimeSessionId: clean(runtimeSessionId, 200) || null,
        threadId: clean(threadId || (runtimeKind === "codex" ? runtimeSessionId : ""), 200) || null,
        boundAt: now(),
      },
    });
    next.projectId = current.projectId;
    next.updatedAt = now();
    projects.set(next.projectId, next);
    await persist();
    return clone(next);
  };

  await sync();
  return {
    list,
    get,
    getByKey,
    getForEmployee,
    listForEmployee,
    sync,
    bindMainConversation,
    close: () => writeQueue,
  };
};
