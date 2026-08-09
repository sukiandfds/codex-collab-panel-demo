const text = (value, max = 2000) => String(value || "").trim().slice(0, max);

const normalizeItems = (items, kind) => (Array.isArray(items) ? items : [])
  .map((item) => {
    if (typeof item === "string") return { text: text(item), kind };
    return { ...item, text: text(item?.text || item?.content), kind };
  })
  .filter((item) => item.text);

/**
 * Review is deliberately an injectable boundary. A future model-backed reviewer
 * can implement the same method; the fallback never blocks the main task.
 */
export const createEmployeeGrowthReviewer = ({ review } = {}) => ({
  async reviewTask(input) {
    if (typeof review === "function") return review(input);
    const task = text(input?.taskText, 600);
    const reply = text(input?.replyText, 1000);
    return {
      facts: reply ? [{ text: reply, source: "assistant", confidence: "low" }] : [],
      rules: [],
      skills: [],
      source: "deterministic-fallback",
      task: task || null,
};
  },
  normalize(candidate = {}) {
    return {
      facts: normalizeItems(candidate.facts, "fact"),
      rules: normalizeItems(candidate.rules, "rule"),
      skills: normalizeItems(candidate.skills, "skill"),
      source: text(candidate.source, 80) || "reviewer",
    };
  },
});
