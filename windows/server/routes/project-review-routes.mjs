import { sendJson } from "../http/request-utils.mjs";

export const createProjectReviewRoutes = ({ activityIndex, projectStatus }) => async (request, response, url) => {
  if (projectStatus && url.pathname === "/api/project-status" && request.method === "GET") {
    const projectId = String(url.searchParams.get("projectId") || "").trim();
    const projectRoot = String(url.searchParams.get("projectRoot") || "").trim();
    if (!projectId && !projectRoot) {
      sendJson(response, { error: "projectId or projectRoot is required" }, 400);
      return true;
    }
    sendJson(response, projectStatus.get({
      projectId,
      projectRoot,
      timeZoneOffsetMinutes: Number(url.searchParams.get("timeZoneOffsetMinutes") || -new Date().getTimezoneOffset()),
    }));
    return true;
  }
  if (url.pathname !== "/api/project-review/activity" || request.method !== "GET") return false;
  const projectId = String(url.searchParams.get("projectId") || "").trim();
  const date = String(url.searchParams.get("date") || "").trim();
  if (!projectId || !date) {
    sendJson(response, { error: "projectId and date are required" }, 400);
    return true;
  }
  const requestedOffset = url.searchParams.get("timeZoneOffsetMinutes");
  sendJson(response, await activityIndex.read({
    projectId,
    date,
    ...(requestedOffset === null ? {} : { timeZoneOffsetMinutes: Number(requestedOffset) }),
  }));
  return true;
};
