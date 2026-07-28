import { sendJson } from "../http/request-utils.mjs";

export const createVersionRoutes = ({ readWebVersion }) => async (_request, response, url) => {
  if (url.pathname !== "/api/version") return false;
  sendJson(response, await readWebVersion());
  return true;
};
