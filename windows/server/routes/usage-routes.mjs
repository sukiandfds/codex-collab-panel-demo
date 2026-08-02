import { sendJson } from "../http/request-utils.mjs";

export const createUsageRoutes = ({ fushengUsage }) => async (request, response, url) => {
  if (url.pathname !== "/api/usage/fusheng" || request.method !== "GET") return false;
  if (!fushengUsage) {
    const error = new Error("浮生云算用量服务未配置");
    error.statusCode = 503;
    throw error;
  }
  sendJson(response, await fushengUsage.read({
    force: url.searchParams.get("refresh") === "1",
    cacheKey: url.searchParams.get("turnId") || "",
  }));
  return true;
};
