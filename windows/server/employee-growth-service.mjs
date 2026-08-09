import fs from "node:fs/promises";
import path from "node:path";

const clean = (value, max = 2000) => String(value || "").trim().slice(0, max);
const slugify = (value) => clean(value, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

const inside = (root, target) => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
};

const atomicWrite = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, value, "utf8");
  await fs.rename(temporary, file);
};

const managedRules = (rules) => [
  "<!-- NEGUS-MANAGED-EMPLOYEE-RULES:BEGIN -->",
  ...rules.map((rule) => `- ${clean(rule.text, 1000)}`),
  "<!-- NEGUS-MANAGED-EMPLOYEE-RULES:END -->",
].join("\n");

export const createEmployeeGrowthService = ({ registry, store, reviewer, broadcast = () => {}, conversationStore }) => {
  const activeReviews = new Map();
  const readLastTurn = async (employeeId, fallback = {}) => {
    try {
      const messages = await conversationStore?.readMessages?.(registry.require(employeeId).conversationId);
      const list = Array.isArray(messages) ? messages : [];
      return {
        taskText: list.findLast?.((message) => message.role === "user")?.text || fallback.taskText || "",
        replyText: list.findLast?.((message) => message.role === "assistant")?.text || fallback.replyText || "",
      };
    } catch {
      return fallback;
    }
  };

  const reviewTask = async ({ employeeId, threadId = "", turnId = "", requestId = "", taskText = "", replyText = "" }) => {
    const employee = registry.require(employeeId);
    const reviewKey = `${employeeId}:${turnId || requestId || Date.now()}`;
    if (activeReviews.has(reviewKey)) return activeReviews.get(reviewKey);
    const task = await readLastTurn(employeeId, { taskText, replyText });
    const promise = (async () => {
      try {
        const raw = await reviewer.reviewTask({ employeeId, threadId, turnId, ...task });
        const candidate = reviewer.normalize(raw || {});
        const facts = [];
        for (const fact of candidate.facts) facts.push(await store.addFact(employeeId, fact, { requestId: `${reviewKey}:fact:${facts.length}` }));
        const proposals = [];
        for (const rule of candidate.rules) proposals.push(await store.addProposal(employeeId, { kind: "rule", text: rule.text, source: candidate.source }, { requestId: `${reviewKey}:rule:${proposals.length}` }));
        for (const skill of candidate.skills) proposals.push(await store.addProposal(employeeId, { kind: "skill", text: skill.text, slug: slugify(skill.slug || skill.name || skill.text), source: candidate.source }, { requestId: `${reviewKey}:skill:${proposals.length}` }));
        const result = { employeeId, turnId, requestId: requestId || null, facts, proposals, source: candidate.source };
        broadcast({ type: "employee_growth_ready", ...result });
        return result;
      } catch (error) {
        const result = { employeeId, turnId, requestId: requestId || null, error: clean(error?.message || error, 500) };
        try { await store.appendLog(employeeId, { action: "review_failed", ...result }); } catch {}
        broadcast({ type: "employee_growth_failed", ...result });
        return result;
      } finally {
        activeReviews.delete(reviewKey);
      }
    })();
    activeReviews.set(reviewKey, promise);
    return promise;
  };

  const get = (employeeId) => store.get(employeeId);
  const getContext = (employeeId) => {
    const value = store.get(employeeId);
    return JSON.stringify({
      facts: value.facts.filter((item) => item.status === "saved").slice(-40),
      approved: value.proposals.filter((item) => item.status === "approved").slice(-40),
    });
  };

  const decide = async (employeeId, proposalId, decision, { requestId = "" } = {}) => {
    const proposal = store.get(employeeId).proposals.find((item) => item.id === proposalId);
    if (!proposal) throw Object.assign(new Error("Growth proposal does not exist."), { statusCode: 404 });
    if (proposal.status !== "pending") return proposal;
    const employee = registry.require(employeeId);
    const updated = await store.decide(employeeId, proposalId, decision, { requestId });
    if (decision !== "approved") return updated;
    try {
      const root = path.resolve(employee.contextRoot);
      if (!inside(root, root)) throw new Error("Invalid employee context root.");
      if (updated.kind === "rule") {
        const file = path.join(root, "AGENTS.md");
        let content = "";
        try { content = await fs.readFile(file, "utf8"); } catch {}
        const begin = "<!-- NEGUS-MANAGED-EMPLOYEE-RULES:BEGIN -->";
        const end = "<!-- NEGUS-MANAGED-EMPLOYEE-RULES:END -->";
        const currentRules = store.get(employeeId).proposals.filter((item) => item.kind === "rule" && item.status === "approved");
        const block = managedRules(currentRules);
        const start = content.indexOf(begin);
        const finish = content.indexOf(end);
        if (start >= 0 && finish > start) content = `${content.slice(0, start)}${block}${content.slice(finish + end.length)}`;
        else content = `${content.trimEnd()}${content.trim() ? "\n\n" : ""}${block}\n`;
        await atomicWrite(file, content);
      } else if (updated.kind === "skill") {
        const slug = slugify(updated.slug || updated.text);
        if (!slug) throw new Error("Skill slug is invalid.");
        const file = path.join(root, ".agents", "skills", slug, "SKILL.md");
        if (!inside(root, file)) throw new Error("Skill path is outside employee context root.");
        await atomicWrite(file, `# ${slug}\n\n${clean(updated.text, 4000)}\n`);
      }
      await store.appendLog(employeeId, { action: "proposal_written", itemId: proposalId, requestId: requestId || null });
      broadcast({ type: "employee_growth_written", employeeId, proposal: { ...updated, writeStatus: "written" } });
      return { ...updated, writeStatus: "written" };
    } catch (error) {
      const detail = clean(error?.message || error, 500);
      const retryable = await store.requeue(employeeId, proposalId, { error: detail, requestId });
      await store.appendLog(employeeId, { action: "proposal_write_failed", itemId: proposalId, requestId: requestId || null, error: detail });
      broadcast({ type: "employee_growth_failed", employeeId, proposalId, error: detail });
      return { ...retryable, writeStatus: "failed", error: detail };
    }
  };

  return { reviewTask, get, getContext, decide };
};
