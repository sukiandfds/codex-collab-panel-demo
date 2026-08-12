import fs from "node:fs/promises";
import path from "node:path";
import { builtInEmployeesRoot, loadEmployeeDefinitions } from "./employee-definitions.mjs";

const clean = (value, maxLength = 200) => String(value || "").trim().slice(0, maxLength);

const clone = (value) => JSON.parse(JSON.stringify(value));

const readStored = async (stateFile) => {
  try {
    const stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
    return Array.isArray(stored?.employees) ? stored.employees : [];
  } catch { return []; }
};

const normalize = (definition, saved = {}, workspaceRoot) => ({
  ...definition,
  projectRoot: clean(definition.workRoot, 400) || path.join(workspaceRoot, "employees", definition.id),
  contextRoot: clean(saved.contextRoot, 400) || path.join(workspaceRoot, "runtime", "employee-contexts", definition.id),
  mainThreadId: clean(saved.mainThreadId, 120) || null,
  conversationId: clean(saved.conversationId, 120) || null,
  modificationConfirmed: saved.modificationConfirmed === true,
  updatedAt: saved.updatedAt || null,
});

export const createEmployeeProjectRegistry = async ({ stateFile, workspaceRoot, definitions = null }) => {
  const employeeDefinitions = definitions || await loadEmployeeDefinitions(
    builtInEmployeesRoot,
    path.join(workspaceRoot, "employees"),
  );
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
  await Promise.all([...employees.values()].flatMap((employee) => [
    fs.mkdir(employee.projectRoot, { recursive: true }),
    fs.mkdir(employee.contextRoot, { recursive: true }),
  ]));
  return {
    list: () => [...employees.values()].map(publicEmployee),
    get: (employeeId) => publicEmployee(employees.get(clean(employeeId, 80))),
    require: requireEmployee,
    listRuntimeProfiles: () => [...employees.values()].map(clone),
    bindMainThread: (employeeId, mainThreadId) => update(employeeId, { mainThreadId: clean(mainThreadId, 120) || null }),
    bindConversation: (employeeId, conversationId) => update(employeeId, { conversationId: clean(conversationId, 120) || null }),
    setModificationConfirmed: (employeeId, confirmed) => update(employeeId, { modificationConfirmed: Boolean(confirmed) }),
    close: () => writeQueue,
  };
};
