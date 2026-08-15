import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clean = (value, maxLength = 4000) => String(value || "").trim().slice(0, maxLength);
export const builtInEmployeesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "employees");

export const employeeExecutionPace = [
  "默认用最短路径执行。除非用户明确允许长时间开发，普通开发、检查和回复应在 1 分钟内完成。",
  "若预计 1 分钟内无法完成，说明需求、范围或验收信息尚未对齐，应立即停止扩展并提出必要问题。",
  "当用户明确要求详细或全面检查、之后再看、小心或细心修改，或表示将离开一段时间时，可以适当延长；仍须保持高效，不做无关研究、重构、验证或等待。",
].join("");

export const employeeTurnInstructions = (instructions, extra = "") => [
  clean(instructions, 8000),
  employeeExecutionPace,
  clean(extra, 8000),
].filter(Boolean).join("\n");

const normalize = (value, workRoot) => {
  const id = clean(value?.id, 80);
  if (!id) return null;
  return {
    id,
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : 999,
    name: clean(value.name, 160) || id,
    shortName: clean(value.shortName, 40) || id.slice(0, 2),
    aliases: [...new Set((Array.isArray(value.aliases) ? value.aliases : [])
      .map((alias) => clean(alias, 80)).filter(Boolean))],
    responsibility: clean(value.responsibility, 500),
    projectKey: clean(value.projectKey, 120) || `employee-${id}`,
    runtimeKind: clean(value.runtimeKind, 80) || "codex",
    instructions: clean(value.instructions, 8000),
    workRoot: path.join(workRoot, id),
  };
};

export const loadEmployeeDefinitions = async (sourceRoot = builtInEmployeesRoot, workRoot = sourceRoot) => {
  const directories = await fs.readdir(sourceRoot, { withFileTypes: true });
  const loaded = await Promise.all(directories
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const value = JSON.parse(await fs.readFile(path.join(sourceRoot, entry.name, "employee.json"), "utf8"));
      return normalize(value, workRoot);
    }));
  const definitions = loaded.filter(Boolean).sort((left, right) => left.order - right.order);
  if (!definitions.length) throw new Error("No built-in employees were found.");
  return definitions;
};
