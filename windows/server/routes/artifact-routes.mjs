import { readJson, sendJson } from "../http/request-utils.mjs";

export const createArtifactRoutes = ({ groupRoom, roomDirectory, artifacts, webOutputs }) => async (request, response, url) => {
  const previewMatch = /^\/artifact-preview\/([^/]+)$/u.exec(url.pathname);
  if (previewMatch && request.method === "GET") {
    const preview = await webOutputs.readPreview(decodeURIComponent(previewMatch[1]));
    response.writeHead(200, preview.headers);
    response.end(preview.content);
    return true;
  }
  if (url.pathname === "/api/artifacts/publish" && request.method === "POST") {
    const body = await readJson(request);
    const room = roomDirectory?.require(String(body.roomId || groupRoom.snapshot().room.id).trim()) || groupRoom;
    const agent = room.getAgent(String(body.createdByAgent || "").trim());
    if (!agent) {
      sendJson(response, { error: "创建交付物的 Agent 不存在" }, 404);
      return true;
    }
    const messageId = String(body.messageId || "").trim();
    if (messageId && !room.getMessage(messageId)) {
      sendJson(response, { error: "关联的群消息不存在" }, 404);
      return true;
    }
    const artifact = await artifacts.publish({
      artifactId: body.artifactId,
      taskId: body.taskId,
      messageId,
      createdByAgent: agent.id,
      createdByName: agent.name,
      mediaId: body.mediaId,
      relativePath: body.relativePath,
    });
    if (messageId) await room.attachArtifact(messageId, artifact.id);
    sendJson(response, artifact, 201);
    return true;
  }
  if (url.pathname === "/api/artifacts" && request.method === "GET") {
    sendJson(response, artifacts.list({
      messageId: url.searchParams.get("messageId") || "",
      taskId: url.searchParams.get("taskId") || "",
    }));
    return true;
  }
  const htmlMatch = /^\/api\/artifacts\/([^/]+)\/open-html$/u.exec(url.pathname);
  if (htmlMatch && request.method === "GET") {
    const previewPath = await webOutputs.previewForArtifact(decodeURIComponent(htmlMatch[1]));
    response.writeHead(302, { Location: previewPath, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    response.end();
    return true;
  }
  const reviewMatch = /^\/api\/artifacts\/([^/]+)\/review$/u.exec(url.pathname);
  if (reviewMatch && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, await artifacts.review(decodeURIComponent(reviewMatch[1]), body.decision, body.note, body.reviewedBy));
    return true;
  }
  const artifactMatch = /^\/api\/artifacts\/([^/]+)$/u.exec(url.pathname);
  if (artifactMatch && request.method === "GET") {
    sendJson(response, artifacts.get(decodeURIComponent(artifactMatch[1])));
    return true;
  }
  return false;
};
