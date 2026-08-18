import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createJsonlConversationStore } from "../server/jsonl-conversation-store.mjs";
import { createAppServerConversationStore } from "../server/app-server-conversation-store.mjs";
import { createAppServerClient } from "../server/app-server-client.mjs";
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
import { createModelProviderService } from "../server/model-provider-service.mjs";
import { createProjectActivityIndex } from "../server/project-activity-index.mjs";
import { createProjectStatusService } from "../server/project-status-service.mjs";

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
let employeeRuntime;
const jsonlConversations = createJsonlConversationStore({
  sessionRoot,
  projectRoot,
  projectRoots,
  registerMedia: media.register,
  onChange: realtime.broadcast,
});
let agentConversationStore;
const appServerClient = createAppServerClient({ label: "current" });
const modelProviders = createModelProviderService({
  projectRoot,
  defaultClient: appServerClient,
});
const appServerConversations = createAppServerConversationStore({
  projectRoot,
  projectRoots,
  autoTitleStateFile: path.join(projectRoot, "runtime", "conversation-display-titles.json"),
  onAutoTitleChanged: (threadId) => realtime.broadcast({ type: "sessions_changed", threadId }),
  attachmentContent,
  registerMedia: media.register,
  onProtocolMessage: (message) => {
    execution.handleProtocolMessage(message);
    contextManagement?.handleProtocolMessage(message);
    void agentConversationStore?.recordRuntimeEvent?.(message);
    if (message?.method === "thread/name/updated" && message.params?.threadId) {
      realtime.broadcast({ type: "sessions_changed", threadId: message.params.threadId });
    }
    if (message?.method === "thread/goal/updated" && message.params?.threadId) {
      realtime.broadcast({ type: "goal_status", threadId: message.params.threadId, goal: message.params.goal || null });
    }
    if (message?.method === "thread/goal/cleared" && message.params?.threadId) {
      realtime.broadcast({ type: "goal_status", threadId: message.params.threadId, goal: null });
    }
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
  client: appServerClient,
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
  getRuntimeContext: (threadId) => employeeRuntime?.ownsThread?.(threadId)
    ? employeeRuntime.getRuntimeContext(threadId)
    : conversations.getRuntimeContext(threadId),
  compactContext: (threadId) => employeeRuntime?.ownsThread?.(threadId)
    ? employeeRuntime.compactContext(threadId)
    : conversations.compactContext(threadId),
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
const projectedGroupText = (message) => {
  const text = String(message?.text || "").trim();
  const attachmentNames = (Array.isArray(message?.attachments) ? message.attachments : [])
    .map((file) => String(file?.name || "").trim())
    .filter(Boolean);
  return [text, attachmentNames.length ? `附件：${attachmentNames.join("、")}` : ""].filter(Boolean).join("\n");
};
const projectedGroupMessage = ({ message, binding, employeeId }) => ({
  id: `group:${binding.roomId}:${message.id}`,
  role: message.type === "agent" && (message.agentId === employeeId || message.authorId === employeeId)
    ? "assistant"
    : "user",
  text: projectedGroupText(message),
  authorId: message.authorId,
  authorName: message.authorName,
  sequence: message.sequence,
  createdAt: message.createdAt,
  source: "group",
  projectId: binding.projectId,
  targetProjectId: binding.targetProjectId,
  executionRoot: binding.executionRoot,
  roomId: binding.roomId,
  groupMessageId: message.id,
});
const broadcastEmployeeGroupMessage = async ({ message, projectId, roomId }) => {
  const employeeId = String(message?.agentId || message?.authorId || "").trim();
  const employee = employeeRegistry.get(employeeId);
  const roomStore = groupRoomDirectory?.get?.(roomId);
  const agent = roomStore?.getAgent?.(employeeId);
  const threadId = String(agent?.threadId || "").trim();
  if (!employee || !roomStore || !threadId || message?.type !== "agent") return;
  const employeeProject = projectIdentity.getForEmployee(employeeId);
  const targetProject = projectIdentity.get(projectId);
  const binding = await employeeConversationStore?.openGroupForAgent?.({
    agentId: employeeId,
    roomId,
    projectId: employeeProject?.projectId,
    targetProjectId: projectId,
    executionRoot: targetProject?.root,
    threadId,
    title: `${roomStore.snapshot().room.name} · ${agent.name}`,
  });
  if (!binding) return;
  const projectedMessage = projectedGroupMessage({ message, binding, employeeId });
  await employeeConversationStore.appendMessage({ conversationId: binding.conversationId, message: projectedMessage });
  realtime.broadcast({
    type: "employee_message_completed",
    employeeId,
    threadId,
    conversationId: binding.conversationId,
    message: projectedMessage,
    source: "group",
    projectId: binding.projectId,
    targetProjectId: binding.targetProjectId,
    executionRoot: binding.executionRoot,
    roomId,
  });
  realtime.broadcast({ type: "sessions_changed", threadId, conversationId: binding.conversationId, employeeId, source: "group", projectId: binding.projectId, targetProjectId: binding.targetProjectId, roomId });
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
      modelProviderId: employee.modelProviderId,
      model: employee.model,
      reasoningEffort: employee.reasoningEffort,
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
const recordEmployeeGroupContext = async ({ identity, room, agentId, threadId, messages }) => {
  const employee = employeeRegistry.get(agentId);
  if (!employee || !threadId || !Array.isArray(messages) || !messages.length) return;
  const employeeProject = projectIdentity.getForEmployee(agentId);
  const binding = await employeeConversationStore.openGroupForAgent({
    agentId,
    roomId: room.snapshot().room.id,
    projectId: employeeProject?.projectId,
    targetProjectId: identity.projectId,
    executionRoot: identity.root || identity.roots?.project,
    threadId,
    title: `${room.snapshot().room.name} · ${employee.name}`,
  });
  if (!binding) return;
  for (const message of messages) {
    const projected = projectedGroupMessage({ message, binding, employeeId: agentId });
    if (projected.text) {
      await employeeConversationStore.appendMessage({ conversationId: binding.conversationId, message: projected });
    }
  }
  realtime.broadcast({
    type: "sessions_changed",
    threadId,
    conversationId: binding.conversationId,
    employeeId: agentId,
    source: "group",
    projectId: binding.projectId,
    targetProjectId: binding.targetProjectId,
    roomId: binding.roomId,
  });
};
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
employeeRuntime = createEmployeeRuntimeService({
  registry: employeeRegistry,
  conversationStore: employeeConversationStore,
  projectRoot,
  broadcast: realtime.broadcast,
  growthService: employeeGrowth,
  contextProvider: employeeGrowth.getContext,
  client: appServerClient,
  modelProviders,
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
    onContextDelivered: ({ agentId, threadId, messages }) => recordEmployeeGroupContext({
      identity,
      room,
      agentId,
      threadId,
      messages,
    }),
    appServerClient,
    modelProviders,
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
const projectActivityIndex = createProjectActivityIndex({
  projectDirectory: projectIdentity,
  conversations,
  roomDirectory: groupRoomDirectory,
  excludeThread: (threadId) => employeeRuntime.ownsThread(threadId)
    || Boolean(agentConversationStore.findByRuntimeSession("codex", threadId)),
});
const projectStatus = createProjectStatusService({ activityIndex: projectActivityIndex });

const serveStatic = createStaticFileServer(webRoot);
const readWebVersion = createWebVersionReader(webRoot);
const requestHandler = createRequestHandler({
  token, project, projectRoot, device, observerPort, conversations, execution, media, realtime, submissions,
  followUpQueue, contextManagement, groupRoom, roomDirectory: groupRoomDirectory, multiAgent, multiAgentDirectory, artifacts, webOutputs, fushengUsage, readWebVersion, serveStatic,
  agentConversationStore, agentPublicationService, employeeRuntime,
  employeeProjectDirectory, employeeGrowth,
  modelProviders, projectActivityIndex, projectStatus,
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
  modelProviders.close();
  void employeeGrowthStore.close();
  void employeeConversationStore.close();
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
