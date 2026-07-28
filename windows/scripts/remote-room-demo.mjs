import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createJsonlConversationStore } from "../server/jsonl-conversation-store.mjs";
import { createAppServerConversationStore } from "../server/app-server-conversation-store.mjs";
import { createConversationService } from "../server/conversation-service.mjs";
import { createMediaService } from "../server/media-service.mjs";
import { createRealtimeHub } from "../server/realtime-hub.mjs";
import { createExecutionTracker } from "../server/execution-tracker.mjs";
import { createContextManagementService } from "../server/context-management-service.mjs";
import { createRequestHandler } from "../server/request-handler.mjs";
import { createStaticFileServer } from "../server/static-files.mjs";
import { createGroupRoomStore } from "../server/group-room-store.mjs";
import { createMultiAgentService } from "../server/multi-agent-service.mjs";
import { createArtifactService } from "../server/artifact-service.mjs";
import { createWebOutputService } from "../server/web-output-service.mjs";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const port = Number(getArg("--port", "9360"));
const observerPort = Number(getArg("--observer-port", "9350"));
const project = getArg("--project", "codex-collab-panel-demo");
const projectRoot = path.resolve(getArg("--project-root", process.cwd()));
const webRoot = path.resolve(getArg("--web-root", path.join(process.cwd(), "web-ui", "dist")));
const token = getArg("--token", randomBytes(12).toString("hex"));
const deviceName = String(getArg("--device-name", os.hostname())).trim() || os.hostname();
const device = { name: deviceName, startedAt: new Date().toISOString() };
const sessionRoot = process.env.CODEX_SESSION_DIR || path.join(os.homedir(), ".codex", "sessions");
const media = createMediaService({ uploadRoot: path.join(projectRoot, "runtime", "uploads") });
await media.restoreUploads();
const realtime = createRealtimeHub();
const execution = createExecutionTracker({ broadcast: realtime.broadcast });
let contextManagement;
const jsonlConversations = createJsonlConversationStore({
  sessionRoot,
  projectRoot,
  registerMedia: media.register,
  onChange: realtime.broadcast,
});
const appServerConversations = createAppServerConversationStore({
  projectRoot,
  registerMedia: media.register,
  onProtocolMessage: (message) => {
    execution.handleProtocolMessage(message);
    contextManagement?.handleProtocolMessage(message);
  },
  onSubmitted: execution.markSubmitted,
  onFailed: execution.markFailed,
});
const conversations = createConversationService({ primary: appServerConversations, fallback: jsonlConversations });
contextManagement = await createContextManagementService({
  stateFile: path.join(projectRoot, "runtime", "context-settings.json"),
  broadcast: realtime.broadcast,
  getExecutionStatus: execution.getStatus,
  getRuntimeContext: conversations.getRuntimeContext,
  compactContext: conversations.compactContext,
});
const groupRoom = await createGroupRoomStore({
  stateFile: path.join(projectRoot, "runtime", "group-room.json"),
  project,
  broadcast: realtime.broadcast,
});
const artifacts = await createArtifactService({
  stateFile: path.join(projectRoot, "runtime", "artifacts.json"),
  allowedRoot: path.join(projectRoot, "runtime", "agent-artifacts"),
  projectId: project,
  media,
  broadcast: realtime.broadcast,
});
const webOutputs = createWebOutputService({
  projectRoot,
  originBaseUrl: `http://127.0.0.1:${port}`,
  artifacts,
  media,
});
const multiAgent = createMultiAgentService({
  projectRoot,
  room: groupRoom,
  broadcast: realtime.broadcast,
  webOutputs,
});

const serveStatic = createStaticFileServer(webRoot);
const requestHandler = createRequestHandler({
  token, project, projectRoot, device, observerPort, conversations, execution, media, realtime,
  contextManagement, groupRoom, multiAgent, artifacts, webOutputs, serveStatic,
});
const server = http.createServer(requestHandler);

const close = () => {
  realtime.close();
  conversations.close();
  void contextManagement.close();
  multiAgent.close();
  webOutputs.close();
  void artifacts.close();
  void groupRoom.close();
  server.close();
};
process.once("SIGINT", close);
process.once("SIGTERM", close);

server.listen(port, "0.0.0.0", () => {
  console.log(`[remote-room-demo] ${projectRoot}`);
  console.log(`[remote-room-demo] device: ${deviceName}`);
  console.log(`[remote-room-demo] http://127.0.0.1:${port}/?token=${token}`);
  console.log(`[remote-room-demo] http://127.0.0.1:${port}/group.html?token=${token}`);
});
