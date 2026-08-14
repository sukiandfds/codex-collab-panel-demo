import { readJson, sendJson } from "../http/request-utils.mjs";

const clean = (value, limit = 160) => String(value || "").trim().slice(0, limit);

const actorFrom = (request) => ({
  id: clean(request.headers["x-codex-actor-id"], 160) || "manager",
  name: clean(request.headers["x-codex-actor-name"], 160) || "运营管理",
});

const decodePart = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
};

const goalMatch = (pathname) => {
  const match = /^\/api\/goals\/([^/]+)$/u.exec(pathname);
  return match ? decodePart(match[1]) : "";
};

const actionMatch = (pathname) => {
  const match = /^\/api\/goals\/([^/]+)\/action$/u.exec(pathname);
  return match ? decodePart(match[1]) : "";
};

const taskMatch = (pathname) => {
  const match = /^\/api\/goals\/([^/]+)\/tasks$/u.exec(pathname);
  return match ? decodePart(match[1]) : "";
};

const taskDetailMatch = (pathname) => {
  const match = /^\/api\/goals\/([^/]+)\/tasks\/([^/]+)$/u.exec(pathname);
  return match ? { goalId: decodePart(match[1]), taskId: decodePart(match[2]) } : null;
};

const runMatch = (pathname) => {
  const match = /^\/api\/goals\/([^/]+)\/tasks\/([^/]+)\/runs$/u.exec(pathname);
  return match ? { goalId: decodePart(match[1]), taskId: decodePart(match[2]) } : null;
};

const runDetailMatch = (pathname) => {
  const match = /^\/api\/goals\/([^/]+)\/runs\/([^/]+)$/u.exec(pathname);
  return match ? { goalId: decodePart(match[1]), runId: decodePart(match[2]) } : null;
};

export const createGoalRoutes = ({ goals }) => async (request, response, url) => {
  if (!goals) return false;

  if (url.pathname === "/api/goals" && request.method === "GET") {
    sendJson(response, { goals: goals.list({ status: clean(url.searchParams.get("status"), 80) }) });
    return true;
  }

  if (url.pathname === "/api/goals" && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, { goal: await goals.create(body, actorFrom(request)) }, 201);
    return true;
  }

  const actionGoalId = actionMatch(url.pathname);
  if (actionGoalId && request.method === "POST") {
    const body = await readJson(request);
    const expectedVersion = body.expectedVersion;
    const actor = actorFrom(request);
    const actions = {
      pause: goals.pause,
      resume: goals.resume,
      wait: goals.wait,
      complete: goals.complete,
      clear: goals.clear,
    };
    const action = clean(body.action, 40);
    if (!actions[action]) {
      sendJson(response, { error: "Goal 操作无效" }, 400);
      return true;
    }
    sendJson(response, { goal: await actions[action](actionGoalId, actor, expectedVersion) }, 202);
    return true;
  }

  const taskGoalId = taskMatch(url.pathname);
  if (taskGoalId && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, goals.addTask(taskGoalId, body, actorFrom(request)), 201);
    return true;
  }

  const taskDetail = taskDetailMatch(url.pathname);
  if (taskDetail && request.method === "PATCH") {
    const body = await readJson(request);
    sendJson(response, goals.updateTask(taskDetail.goalId, taskDetail.taskId, body, actorFrom(request)));
    return true;
  }

  const runPath = runMatch(url.pathname);
  if (runPath && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, goals.addRun(runPath.goalId, runPath.taskId, body, actorFrom(request)), 201);
    return true;
  }

  const runDetail = runDetailMatch(url.pathname);
  if (runDetail && request.method === "PATCH") {
    const body = await readJson(request);
    sendJson(response, goals.updateRun(runDetail.goalId, runDetail.runId, body, actorFrom(request)));
    return true;
  }

  const id = goalMatch(url.pathname);
  if (!id) return false;
  if (request.method === "GET") {
    sendJson(response, { goal: goals.get(id) });
    return true;
  }
  if (request.method === "PATCH") {
    const body = await readJson(request);
    sendJson(response, { goal: await goals.update(id, body, actorFrom(request)) });
    return true;
  }
  return false;
};
