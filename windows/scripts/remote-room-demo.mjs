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
import { createRequestHandler } from "../server/request-handler.mjs";
import { createStaticFileServer } from "../server/static-files.mjs";
import { createGroupRoomStore } from "../server/group-room-store.mjs";
import { createMultiAgentService } from "../server/multi-agent-service.mjs";

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
const sessionRoot = process.env.CODEX_SESSION_DIR || path.join(os.homedir(), ".codex", "sessions");
const media = createMediaService();
const realtime = createRealtimeHub();
const execution = createExecutionTracker({ broadcast: realtime.broadcast });
const jsonlConversations = createJsonlConversationStore({
  sessionRoot,
  projectRoot,
  registerMedia: media.register,
  onChange: realtime.broadcast,
});
const appServerConversations = createAppServerConversationStore({
  projectRoot,
  registerMedia: media.register,
  onProtocolMessage: execution.handleProtocolMessage,
  onSubmitted: execution.markSubmitted,
  onFailed: execution.markFailed,
});
const conversations = createConversationService({ primary: appServerConversations, fallback: jsonlConversations });
const groupRoom = await createGroupRoomStore({
  stateFile: path.join(projectRoot, "runtime", "group-room.json"),
  project,
  broadcast: realtime.broadcast,
});
const multiAgent = createMultiAgentService({ projectRoot, room: groupRoom, broadcast: realtime.broadcast });

const serveStatic = createStaticFileServer(webRoot);
const requestHandler = createRequestHandler({
  token, project, projectRoot, observerPort, conversations, execution, media, realtime,
  groupRoom, multiAgent, serveStatic,
});
const server = http.createServer(requestHandler);

const close = () => {
  realtime.close();
  conversations.close();
  multiAgent.close();
  void groupRoom.close();
  server.close();
};
process.once("SIGINT", close);
process.once("SIGTERM", close);

server.listen(port, "0.0.0.0", () => {
  console.log(`[remote-room-demo] ${projectRoot}`);
  console.log(`[remote-room-demo] http://127.0.0.1:${port}/?token=${token}`);
  console.log(`[remote-room-demo] http://127.0.0.1:${port}/group.html?token=${token}`);
});
