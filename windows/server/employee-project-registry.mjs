import fs from "node:fs/promises";
import path from "node:path";

const clean = (value, maxLength = 200) => String(value || "").trim().slice(0, maxLength);

const employeeDefinitions = [
  {
    id: "manager",
    name: "Project Manager Agent",
    shortName: "PM",
    responsibility: "Clarify goals, split work, and report project outcomes.",
    projectKey: "employee-manager",
    runtimeKind: "codex",
    instructions: "You are the long-lived Negus project manager employee. Keep your stable identity independent from any Thread, model, or runtime. Clarify goals, split work, and report outcomes. Do not make unresolved decisions without user confirmation.",
  },
  {
    id: "researcher",
    name: "Research Agent",
    shortName: "Research",
    responsibility: "Perform read-only research, technical verification, and evidence comparison.",
    projectKey: "employee-researcher",
    runtimeKind: "codex",
    instructions: "You are the long-lived Negus research employee. Keep your stable identity independent from any Thread, model, or runtime. Perform read-only research and report evidence, risks, and recommendations without changing project files.",
  },
  {
    id: "developer",
    name: "Developer Director Agent",
    shortName: "Developer",
    responsibility: "Implement confirmed code changes, verify them, and report results.",
    projectKey: "employee-developer",
    runtimeKind: "codex",
    instructions: [
      "You are the long-lived Negus developer director employee. Keep your stable identity as developer, independent from any Thread, model, or runtime.",
      "Before the user confirms implementation, only discuss, analyze, plan, and inspect; do not modify files or invoke execution subagents.",
      "After confirmation, use Codex subagents for concrete code, documentation, and verification work. Subagents are temporary workers, not long-lived employees or group members.",
      "The main conversation splits work, reviews results, and reports to the user. Changing a model, CLI, or Runtime must not change the developer identity or history.",
      "Legacy policy marker: \u53ea\u80fd\u8ba8\u8bba.",
    ].join(" "),
  },
];

const clone = (value) => JSON.parse(JSON.stringify(value));

const readStored = async (stateFile) => {
  try {
    const stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
    return Array.isArray(stored?.employees) ? stored.employees : [];
  } catch { return []; }
};

const normalize = (definition, saved = {}, workspaceRoot) => ({
  ...definition,
  projectRoot: clean(saved.projectRoot, 400) || workspaceRoot,
  contextRoot: clean(saved.contextRoot, 400) || path.join(workspaceRoot, "runtime", "employee-contexts", definition.id),
  mainThreadId: clean(saved.mainThreadId, 120) || null,
  conversationId: clean(saved.conversationId, 120) || null,
  modificationConfirmed: saved.modificationConfirmed === true,
  updatedAt: saved.updatedAt || null,
});

export const createEmployeeProjectRegistry = async ({ stateFile, workspaceRoot }) => {
  const saved = new Map((await readStored(stateFile)).map((entry) => [entry?.id, entry]));
  const employees = new Map(employeeDefinitions.map((definition) => [
    definition.id,
    normalize(definition, saved.get(definition.id), workspaceRoot),
  ]));
  let writeQueue = Promise.resolve();
  const persist = () => {
    const payload = JSON.stringify({ version: 1, employees: [...employees.values()] }, null, 2);
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      const temporary = `${stateFile}.${process.pid}.tmp`;
      await fs.writeFile(temporary, `${payload}\n`, "utf8");
      await fs.rename(temporary, stateFile);
    });
    return writeQueue;
  };
  const publicEmployee = (employee) => {
    if (!employee) return null;
    const { instructions, ...publicValue } = employee;
    return clone(publicValue);
  };
  const requireEmployee = (employeeId) => {
    const employee = employees.get(clean(employeeId, 80));
    if (!employee) throw Object.assign(new Error("Employee does not exist."), { statusCode: 404 });
    return employee;
  };
  const update = async (employeeId, patch) => {
    const current = requireEmployee(employeeId);
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    employees.set(current.id, next);
    await persist();
    return publicEmployee(next);
  };
  await persist();
  await Promise.all([...employees.values()].map((employee) => fs.mkdir(employee.contextRoot, { recursive: true })));
  return {
    list: () => [...employees.values()].map(publicEmployee),
    get: (employeeId) => publicEmployee(employees.get(clean(employeeId, 80))),
    require: requireEmployee,
    bindMainThread: (employeeId, mainThreadId) => update(employeeId, { mainThreadId: clean(mainThreadId, 120) || null }),
    bindConversation: (employeeId, conversationId) => update(employeeId, { conversationId: clean(conversationId, 120) || null }),
    setModificationConfirmed: (employeeId, confirmed) => update(employeeId, { modificationConfirmed: Boolean(confirmed) }),
    close: () => writeQueue,
  };
};
