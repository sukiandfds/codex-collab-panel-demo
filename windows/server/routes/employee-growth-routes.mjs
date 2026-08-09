import { readJson, sendJson } from "../http/request-utils.mjs";

const employeeIdFrom = (url, body = {}) => String(body.employeeId || url.searchParams.get("employeeId") || "").trim();

export const createEmployeeGrowthRoutes = ({ growth }) => async (request, response, url) => {
  if (url.pathname === "/api/employee-growth" && request.method === "GET") {
    sendJson(response, growth.get(employeeIdFrom(url)));
    return true;
  }
  const match = /^\/api\/employee-growth\/(approve|reject)$/u.exec(url.pathname);
  if (match && request.method === "POST") {
    const body = await readJson(request);
    const decision = match[1] === "approve" ? "approved" : "rejected";
    sendJson(response, await growth.decide(employeeIdFrom(url, body), body.proposalId, decision, { requestId: body.requestId }), 202);
    return true;
  }
  return false;
};
