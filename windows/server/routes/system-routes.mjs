import path from "node:path";
import { sendJson } from "../http/request-utils.mjs";
import { readProjectManagement, readProjectManagementEntry } from "../project-management-store.mjs";
import { readProjectProgress } from "../project-progress-store.mjs";

const createObserverReader = (observerPort) => async (threadId = "") => {
  try {
    const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
    const response = await fetch(`http://127.0.0.1:${observerPort}/status${query}`);
    if (!response.ok) throw new Error(`observer HTTP ${response.status}`);
    return await response.json();
  } catch {
    return { connected: false, summaryStatus: "offline", summary: "" };
  }
};

export const createSystemRoutes = ({ token, project, projectRoot, device, observerPort, media, realtime }) => {
  const readObserverStatus = createObserverReader(observerPort);
  const progressFile = path.join(projectRoot, "docs", "feature-development", "FEATURE_INDEX.md");
  return async (request, response, url) => {
    if (url.pathname === "/api/project") {
      sendJson(response, { name: project, root: projectRoot, mode: "interactive" });
      return true;
    }
    if (url.pathname === "/api/device") {
      sendJson(response, device);
      return true;
    }
    if (url.pathname === "/api/share-link" && request.method === "GET") {
      sendJson(response, { token });
      return true;
    }
    if (url.pathname === "/api/project-progress" && request.method === "GET") {
      sendJson(response, await readProjectProgress({ project, projectRoot, progressFile }));
      return true;
    }
    if (url.pathname === "/api/project-management" && request.method === "GET") {
      sendJson(response, await readProjectManagement({ project, projectRoot }));
      return true;
    }
    const projectManagementEntryMatch = /^\/api\/project-management\/entries\/([A-Z][A-Z0-9]+-\d{3})$/u.exec(url.pathname);
    if (projectManagementEntryMatch && request.method === "GET") {
      sendJson(response, await readProjectManagementEntry({ projectRoot, entryId: projectManagementEntryMatch[1] }));
      return true;
    }
    if (url.pathname === "/api/uploads" && request.method === "POST") {
      const upload = await media.upload(request, {
        name: url.searchParams.get("name") || "attachment",
        mimeType: request.headers["content-type"] || "",
      });
      sendJson(response, upload, 201);
      return true;
    }
    if (url.pathname.startsWith("/api/media/")) {
      await media.serve(request, response, url.pathname.slice("/api/media/".length), url.searchParams.get("download") === "1");
      return true;
    }
    if (url.pathname === "/api/status") {
      sendJson(response, await readObserverStatus(url.searchParams.get("threadId") || ""));
      return true;
    }
    if (url.pathname === "/events") {
      realtime.connect(request, response);
      return true;
    }
    return false;
  };
};
