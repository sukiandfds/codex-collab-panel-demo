import { sendJson } from "../http/request-utils.mjs";

export const createEmployeeProjectDirectoryRoutes = ({ directory }) => async (request, response, url) => {
  if (url.pathname === "/api/project-directory" && request.method === "GET") {
    sendJson(response, await directory.list());
    return true;
  }
  return false;
};
