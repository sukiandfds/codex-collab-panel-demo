import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createJsonlConversationStore } from "../server/jsonl-conversation-store.mjs";
import { createAppServerConversationStore } from "../server/app-server-conversation-store.mjs";
import { createConversationService } from "../server/conversation-service.mjs";
import { createConversationVersionStore } from "../server/conversation-version-store.mjs";
import { createMediaService } from "../server/media-service.mjs";
import { createRealtimeHub } from "../server/realtime-hub.mjs";
import { createExecutionTracker } from "../server/execution-tracker.mjs";
import { createSubmissionStore } from "../server/submission-store.mjs";
import { createFollowUpQueueService } from "../server/follow-up-queue-service.mjs";
import { createContextManagementService } from "../server/context-management-service.mjs";
import { createRequestHandler } from "../server/request-handler.mjs";
import { createStaticFileServer } from "../server/static-files.mjs";
import { createWebVersionReader } from "../server/web-version.mjs";
import { createGroupRoomStore } from "../server/group-room-store.mjs";
import { createMultiAgentService } from "../server/multi-agent-service.mjs";
import { createArtifactService } from "../server/artifact-service.mjs";
import { createWebOutputService } from "../server/web-output-service.mjs";
import { createFushengUsageService } from "../server/fusheng-usage-service.mjs";
import { createImageGenerationRunStore } from "../server/image-generation/image-generation-run-store.mjs";
import { createAgentConversationStore } from "../server/agent-conversation-store.mjs";
import { createPublicationStore } from "../server/publication-store.mjs";
import { createAgentPublicationService } from "../server/agent-publication-service.mjs";
import { createGroupRoomDirectory } from "../server/group-room-directory.mjs";
import { createEmployeeProjectRegistry } from "../server/employee-project-registry.mjs";
import { createProjectIdentityStore } from "../server/project-identity-store.mjs";
import { createEmployeeRuntimeService } from "../server/employee-runtime-service.mjs";
import { createEmployeeProjectDirectory } from "../server/employee-project-directory.mjs";
import { createEmployeeGrowthStore } from "../server/employee-growth-store.mjs";
import { createEmployeeGrowthReviewer } from "../server/employee-growth-reviewer.mjs";
import { createEmployeeGrowthService } from "../server/employee-growth-service.mjs";
import { createAttachmentContentService } from "../server/attachment-content-service.mjs";
import { loadEmployeeDefinitions } from "../server/employee-definitions.mjs";
import { loadBusinessProjects } from "../server/business-project-config.mjs";
import { createGoalStore } from "../server/goal-store.mjs";
import { createGoalService } from "../server/goal-service.mjs";
import { buildGoalPrompt, createGoalRuntimeAdapter } from "../server/goal-runtime-adapter.mjs";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const port = Number(getArg("--port", "9360"));
const observerPort = Number(getArg("--observer-port", "9350"));
const project = getArg("--project", "negus");
const projectRoot = path.resolve(getArg("--project-root", process.cwd()));
const employeesRoot = path.join(projectRoot, "employees");
const webRoot = path.resolve(getArg("--web-root", path.join(process.cwd(), "web-ui", "dist")));
const token = getArg("--token", randomBytes(12).toString("hex"));
const deviceName = String(getArg("--device-name", os.hostname())).trim() || os.hostname();
const device = { name: deviceName, startedAt: new Date().toISOString() };
const sessionRoot = process.env.CODEX_SESSION_DIR || path.join(os.homedir(), ".codex", "sessions");
const businessProjects = await loadBusinessProjects(path.join(projectRoot, "runtime", "business-projects.json"));
const projectRoots = [projectRoot, ...businessProjects.map((entry) => entry.root)];
const attachmentContent = createAttachmentContentService();
const media = createMediaService({ uploadRoot: path.join(projectRoot, "runtime", "uploads"), attachmentContent });
await media.restoreUploads();
const imageGenerationRuns = createImageGenerationRunStore({
  stateFile: path.join(projectRoot, "runtime", "image-generation-runs.json"),
  media,
});
const realtime = createRealtimeHub();
const submissions = createSubmissionStore({
  stateFile: path.join(projectRoot, "runtime", "session-submissions.json"),
});
let followUpQueue;
const execution = createExecutionTracker({
  broadcast: realtime.broadcast,
  stateFile: path.join(projectRoot, "runtime", "execution-runs.json"),
  onTurnTerminal: (event) => followUpQueue?.handleTurnTerminal(event),
});
let contextManagement;
let employeeRegistry;
const jsonlConversations = createJsonlConversationStore({
  sessionRoot,
  projectRoot,
  projectRoots,
  registerMedia: media.register,
  onChange: realtime.broadcast,
});
let agentConversationStore;
const appServerConversations = createAppServerConversationStore({
  projectRoot,
  projectRoots,
  attachmentContent,
  registerMedia: media.register,
  onProtocolMessage: (message) => {
    execution.handleProtocolMessage(message);
    contextManagement?.handleProtocolMessage(message);
    void agentConversationStore?.recordRuntimeEvent?.(message);
  },
  onSubmitted: execution.markSubmitted,
  onFailed: execution.markFailed,
  onHealthState: execution.handleHealthState,
  threadRuntimeOptions: async (thread) => {
    const employee = employeeRegistry?.list?.().find((entry) => entry.mainThreadId === thread?.id);
    if (!employee) return null;
    const policy = employee.modificationConfirmed
      ? { sandbox: "workspace-write", approvalPolicy: "on-request" }
      : { sandbox: "read-only", approvalPolicy: "never" };
    return {
      resume: policy,
      turn: {
        cwd: employee.projectRoot,
      },
    };
  },
});
const conversationVersions = createConversationVersionStore({
  stateFile: path.join(projectRoot, "runtime", "conversation-versions.json"),
});
const conversations = createConversationService({
  primary: appServerConversations,
  fallback: jsonlConversations,
  contentVersionStore: conversationVersions,
  supplementalMessages: imageGenerationRuns,
});
followUpQueue = createFollowUpQueueService({
  stateFile: path.join(projectRoot, "runtime", "follow-up-queues.json"),
  execution,
  conversations,
  media,
  publishThreadEvent: execution.publishThreadEvent,
});
void followUpQueue.start();
contextManagement = await createContextManagementService({
  stateFile: path.join(projectRoot, "runtime", "context-settings.json"),
  broadcast: realtime.broadcast,
  getExecutionStatus: execution.getStatus,
  getRuntimeContext: conversations.getRuntimeContext,
  compactContext: conversations.compactContext,
});
const employeeDefinitions = await loadEmployeeDefinitions(employeesRoot);
employeeRegistry = await createEmployeeProjectRegistry({
  stateFile: path.join(projectRoot, "runtime", "employee-projects.json"),
  workspaceRoot: projectRoot,
  definitions: employeeDefinitions,
});
const projectIdentity = await createProjectIdentityStore({
  stateFile: path.join(projectRoot, "runtime", "project-identities.json"),
  project,
  projectRoot,
  registry: employeeRegistry,
  businessProjects,
});
const projectIdentities = projectIdentity.list();
const roomIdForProject = (identity) => identity.kind === "personal"
  ? "current-project"
  : `project-room:${identity.projectId}`;
const broadcastEmployeeGroupMessage = async ({ message, projectId, roomId }) => {
  const employeeId = String(message?.agentId || message?.authorId || "").trim();
  const employee = employeeRegistry.get(employeeId);
  const roomStore = groupRoomDirectory?.get?.(roomId);
  const agent = roomStore?.getAgent?.(employeeId);
  const threadId = String(agent?.threadId || "").trim();
  if (!employee || !roomStore || !threadId || message?.type !== "agent") return;
  const binding = await employeeConversationStore?.openGroupForAgent?.({
    agentId: employeeId,
    roomId,
    projectId,
    threadId,
    title: `${roomStore.snapshot().room.name} · ${agent.name}`,
  });
  if (!binding) return;
  const projectedMessage = {
    id: `group:${roomId}:${message.id}`,
    role: "assistant",
    text: String(message.text || ""),
    createdAt: message.createdAt,
    source: "group",
    projectId,
    roomId,
    groupMessageId: message.id,
  };
  realtime.broadcast({
    type: "employee_message_completed",
    employeeId,
    threadId,
    conversationId: binding.conversationId,
    message: projectedMessage,
    source: "group",
    projectId,
    roomId,
  });
  realtime.broadcast({ type: "sessions_changed", threadId, conversationId: binding.conversationId, employeeId, source: "group", projectId, roomId });
};
const groupRoomEntries = await Promise.all(projectIdentities.filter((identity) => identity.kind !== "employee").map(async (identity) => {
  const roomId = roomIdForProject(identity);
  const stateFile = identity.kind === "personal"
    ? path.join(projectRoot, "runtime", "group-room.json")
    : path.join(projectRoot, "runtime", "group-rooms", `${encodeURIComponent(identity.projectId)}.json`);
  const room = await createGroupRoomStore({
    stateFile,
    project: identity.name,
    projectId: identity.projectId,
    roomId,
    agentDefinitions: employeeRegistry.listRuntimeProfiles().map((employee) => ({
      id: employee.id,
      name: employee.name,
      shortName: employee.shortName,
      aliases: employee.aliases,
      responsibility: employee.responsibility,
      instructions: employee.instructions,
    })),
    broadcast: realtime.broadcast,
    onMessageCreated: broadcastEmployeeGroupMessage,
  });
  return { identity, room };
}));
const groupRoom = groupRoomEntries.find(({ identity }) => identity.kind === "personal")?.room
  || groupRoomEntries[0]?.room;
const groupRoomDirectory = createGroupRoomDirectory({ rooms: groupRoomEntries.map(({ room }) => room) });
const employeeConversationStore = await createAgentConversationStore({
  stateFile: path.join(projectRoot, "runtime", "employee-conversations.json"),
  historyRoot: path.join(projectRoot, "runtime", "employee-conversations"),
  groupRoom,
  roomDirectory: groupRoomDirectory,
});
const employeeGrowthStore = await createEmployeeGrowthStore({
  stateFile: path.join(projectRoot, "runtime", "employee-growth.json"),
  registry: employeeRegistry,
});
const employeeGrowth = createEmployeeGrowthService({
  registry: employeeRegistry,
  store: employeeGrowthStore,
  reviewer: createEmployeeGrowthReviewer(),
  conversationStore: employeeConversationStore,
  broadcast: realtime.broadcast,
});
let goals = null;
const employeeRuntime = createEmployeeRuntimeService({
  registry: employeeRegistry,
  conversationStore: employeeConversationStore,
  projectRoot,
  broadcast: realtime.broadcast,
  growthService: employeeGrowth,
  contextProvider: employeeGrowth.getContext,
  onTurnCompleted: (completion) => goals?.handleRuntimeEvent(completion),
});
const goalStore = createGoalStore({
  stateFile: path.join(projectRoot, "runtime", "goals.json"),
});
const goalRuntimeAdapter = createGoalRuntimeAdapter({
  dispatchGoal: async ({ goal }) => {
    const employeeId = goal.ownerId || "manager";
    if (!employeeRuntime.supportsEmployee(employeeId)) {
      realtime.broadcast({ type: "goal_runtime_requested", goalId: goal.id, ownerId: employeeId });
      return { status: "running", detail: "Goal 已进入系统运行队列，等待负责人适配器" };
    }
    const result = await employeeRuntime.sendMessage({
      employeeId,
      text: buildGoalPrompt(goal),
      requestId: `goal:${goal.id}:start`,
    });
    return {
      status: "running",
      externalRef: result.turnId || result.threadId,
      detail: "Goal 已发送给负责人运行时",
    };
  },
  pauseGoal: async ({ goal }) => {
    if (!employeeRuntime.supportsEmployee(goal.ownerId)) {
      realtime.broadcast({ type: "goal_runtime_pause_requested", goalId: goal.id, ownerId: goal.ownerId });
      return { status: "paused", detail: "已向外部运行适配器请求暂停" };
    }
    return employeeRuntime.interrupt?.(goal.ownerId, goal.runtime?.externalRef);
  },
  resumeGoal: async ({ goal }) => {
    if (!employeeRuntime.supportsEmployee(goal.ownerId)) return { status: "running" };
    const result = await employeeRuntime.sendMessage({
      employeeId: goal.ownerId,
      text: `${buildGoalPrompt(goal)}\n\n请从上次暂停的位置继续。`,
      requestId: `goal:${goal.id}:resume:${goal.version}`,
    });
    return { status: "running", externalRef: result.turnId || result.threadId, detail: "Goal 已继续" };
  },
  stopGoal: async ({ goal }) => {
    if (!employeeRuntime.supportsEmployee(goal.ownerId)) {
      realtime.broadcast({ type: "goal_runtime_stop_requested", goalId: goal.id, ownerId: goal.ownerId });
      return { status: "stop_requested", detail: "已向外部运行适配器请求停止" };
    }
    return employeeRuntime.interrupt?.(goal.ownerId, goal.runtime?.externalRef);
  },
});
goals = createGoalService({
  store: goalStore,
  runtimeAdapter: goalRuntimeAdapter,
  broadcast: realtime.broadcast,
});
const employeeProjectDirectory = createEmployeeProjectDirectory({
  project,
  projectRoot,
  registry: employeeRegistry,
  projectIdentity,
  employeeRuntime,
  conversations,
  execution,
  employeeConversations: employeeConversationStore,
  roomDirectory: groupRoomDirectory,
});
agentConversationStore = employeeConversationStore;
const publicationStore = await createPublicationStore({
  stateFile: path.join(projectRoot, "runtime", "agent-publications.json"),
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
const resolveArtifactInputs = (artifactIds) => [...new Set(Array.isArray(artifactIds) ? artifactIds : [])]
  .slice(0, 6)
  .flatMap((artifactId) => {
    try {
      const artifact = artifacts.get(artifactId);
      return media.resolveMany([artifact.sourceMediaId]);
    } catch {
      return [];
    }
  });
const multiAgentDirectory = new Map(groupRoomEntries.map(({ identity, room }) => {
  const roomId = room.snapshot().room.id;
  const service = createMultiAgentService({
    projectRoot: identity.root || identity.roots?.project || projectRoot,
    employeeWorkRoots: Object.fromEntries(employeeRegistry.list().map((employee) => [employee.id, employee.projectRoot])),
    room,
    broadcast: (event) => realtime.broadcast({ ...event, roomId }),
    webOutputs,
    attachmentContent,
    resolveAttachments: media.resolveMany,
    resolveArtifacts: resolveArtifactInputs,
  });
  return [roomId, service];
}));
const multiAgent = multiAgentDirectory.get(groupRoom.snapshot().room.id);
const agentPublicationService = createAgentPublicationService({
  conversationStore: agentConversationStore,
  conversations,
  groupRoom,
  roomDirectory: groupRoomDirectory,
  publicationStore,
});
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const fushengUsage = createFushengUsageService({
  credentialsFile: path.join(localAppData, "FushengUsageMonitor", "credentials.json"),
});

const serveStatic = createStaticFileServer(webRoot);
const readWebVersion = createWebVersionReader(webRoot);
const requestHandler = createRequestHandler({
  token, project, projectRoot, device, observerPort, conversations, execution, media, realtime, submissions,
  followUpQueue, contextManagement, groupRoom, roomDirectory: groupRoomDirectory, multiAgent, multiAgentDirectory, artifacts, webOutputs, fushengUsage, readWebVersion, serveStatic,
  agentConversationStore, agentPublicationService, employeeRuntime,
  employeeProjectDirectory, employeeGrowth, goals,
});
const server = http.createServer(requestHandler);

const close = () => {
  realtime.close();
  void followUpQueue.close();
  void execution.close();
  void submissions.close();
  conversations.close();
  void imageGenerationRuns.close();
  void contextManagement.close();
  for (const service of new Set(multiAgentDirectory.values())) service.close();
  webOutputs.close();
  void artifacts.close();
  for (const { room } of groupRoomEntries) void room.close();
  employeeRuntime.close();
  void employeeGrowthStore.close();
  void employeeConversationStore.close();
  void goals.close();
  void projectIdentity.close();
  void employeeRegistry.close();
  void publicationStore.close();
  server.close();
};
process.once("SIGINT", close);
process.once("SIGTERM", close);

server.listen(port, "0.0.0.0", () => {
  console.log(`[remote-room-demo] ${projectRoot}`);
  console.log(`[remote-room-demo] device: ${deviceName}`);
  console.log(`[remote-room-demo] http://127.0.0.1:${port}/?token=${token}`);
  console.log(`[remote-room-demo] http://127.0.0.1:${port}/group.html?token=${token}`);
  console.log(`[remote-room-demo] http://127.0.0.1:${port}/employee.html?token=${token}`);
});
