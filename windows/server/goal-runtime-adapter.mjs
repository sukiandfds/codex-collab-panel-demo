const clean = (value, limit = 240) => String(value || "").trim().slice(0, limit);

export const buildGoalPrompt = (goal) => {
  const lines = [
    `Goal：${clean(goal.title, 240)}`,
    `目标：${clean(goal.objective, 32000)}`,
  ];
  if (goal.constraints?.length) lines.push(`约束：\n${goal.constraints.map((item) => `- ${item}`).join("\n")}`);
  if (goal.successCriteria?.length) lines.push(`完成条件：\n${goal.successCriteria.map((item) => `- ${item}`).join("\n")}`);
  if (goal.stopConditions?.length) lines.push(`停止条件：\n${goal.stopConditions.map((item) => `- ${item}`).join("\n")}`);
  lines.push("请由运营管理负责拆解、协调其他员工并持续汇总；只在有新增结论、阻塞或需要用户决策时汇报。", `goal_id=${goal.id}`);
  return lines.join("\n\n");
};

export const createGoalRuntimeAdapter = ({ dispatchGoal, pauseGoal, resumeGoal, stopGoal } = {}) => ({
  start: async (payload) => (typeof dispatchGoal === "function"
    ? dispatchGoal(payload)
    : { status: "accepted", detail: "等待运行时适配器接入" }),
  pause: async (payload) => (typeof pauseGoal === "function" ? pauseGoal(payload) : { status: "paused" }),
  resume: async (payload) => (typeof resumeGoal === "function" ? resumeGoal(payload) : { status: "resumed" }),
  stop: async (payload) => (typeof stopGoal === "function" ? stopGoal(payload) : { status: "stop_requested" }),
});
