const clean = (value, maxLength = 240) => String(value || "").trim().slice(0, maxLength);

const idleStatus = () => ({
  phase: "idle",
  label: "idle",
  active: false,
  turnId: "",
  updatedAt: null,
});

const publicStatus = (value) => ({
  phase: clean(value?.phase, 64) || "idle",
  label: clean(value?.label, 120) || "idle",
  active: value?.active === true,
  ...(value?.turnId ? { turnId: clean(value.turnId, 160) } : { turnId: "" }),
  ...(value?.updatedAt ? { updatedAt: value.updatedAt } : { updatedAt: null }),
});

/**
 * Aggregates the personal project and long-lived employee projects for the
 * sidebar. It intentionally exposes no runtime instructions or internal files.
 */
export const createEmployeeProjectDirectory = ({
  project,
  projectRoot,
  registry,
  employeeRuntime,
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

  const list = async () => {
    const employees = registry?.list?.() || [];
    const employeeProjects = await Promise.all(employees.map(async (employee) => ({
      id: clean(employee.projectKey, 120) || `employee-${employee.id}`,
      name: clean(employee.name, 160) || employee.id,
      kind: "employee",
      root: clean(employee.projectRoot, 400) || projectRoot,
      employeeId: clean(employee.id, 80),
      mainConversationId: clean(employee.conversationId, 120) || null,
      mainThreadId: clean(employee.mainThreadId, 120) || null,
      status: await readEmployeeStatus(employee.id),
    })));
    const own = {
      id: clean(project, 120) || "project",
      name: clean(project, 160) || "My project",
      kind: "personal",
      root: projectRoot,
      status: publicStatus(typeof personalStatus === "function" ? personalStatus() : personalStatus),
    };
    return {
      version: 1,
      projects: [own, ...employeeProjects],
      generatedAt: new Date().toISOString(),
    };
  };

  return { list };
};
