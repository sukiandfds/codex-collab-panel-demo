import { readJson, sendJson } from "../http/request-utils.mjs";

const employeeIdFrom = (url, body = {}) => String(
  body.employeeId || url.searchParams.get("employeeId") || "developer",
).trim();

export const createEmployeeRoutes = ({ employeeRuntime }) => async (request, response, url) => {
  if (url.pathname === "/api/employee/open" && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, await employeeRuntime.open(employeeIdFrom(url, body)), 200);
    return true;
  }
  if (url.pathname === "/api/employee/session" && request.method === "GET") {
    sendJson(response, await employeeRuntime.open(employeeIdFrom(url)));
    return true;
  }
  if (url.pathname === "/api/employee/message" && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, await employeeRuntime.sendMessage({
      employeeId: employeeIdFrom(url, body),
      text: body.text,
      requestId: body.requestId,
    }), 202);
    return true;
  }
  if (url.pathname === "/api/employee/confirm" && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, await employeeRuntime.confirmModification(employeeIdFrom(url, body)), 202);
    return true;
  }
  if (url.pathname === "/api/employee/status" && request.method === "GET") {
    sendJson(response, await employeeRuntime.getStatus(employeeIdFrom(url)));
    return true;
  }
  if (url.pathname === "/api/employee/model-settings" && request.method === "POST") {
    const body = await readJson(request);
    const settings = {};
    if (Object.prototype.hasOwnProperty.call(body, "modelProviderId")) settings.modelProviderId = body.modelProviderId;
    if (Object.prototype.hasOwnProperty.call(body, "model")) settings.model = body.model;
    if (Object.prototype.hasOwnProperty.call(body, "reasoningEffort")) settings.reasoningEffort = body.reasoningEffort;
    sendJson(response, await employeeRuntime.updateModelSettings(employeeIdFrom(url, body), settings));
    return true;
  }
  return false;
};
