import { authorized, rememberAuthorizedDevice } from "./http/access-control.mjs";
import { sendJson } from "./http/request-utils.mjs";
import { createArtifactRoutes } from "./routes/artifact-routes.mjs";
import { createConversationRoutes } from "./routes/conversation-routes.mjs";
import { createFollowUpQueueRoutes } from "./routes/follow-up-queue-routes.mjs";
import { createGroupRoutes } from "./routes/group-routes.mjs";
import { createSystemRoutes } from "./routes/system-routes.mjs";
import { createUsageRoutes } from "./routes/usage-routes.mjs";
import { createVersionRoutes } from "./routes/version-routes.mjs";
import { createAgentPublicationRoutes } from "./routes/agent-publication-routes.mjs";
import { createEmployeeRoutes } from "./routes/employee-routes.mjs";
import { createEmployeeProjectDirectoryRoutes } from "./routes/employee-project-directory-routes.mjs";
import { createEmployeeGrowthRoutes } from "./routes/employee-growth-routes.mjs";
import { createProjectReviewRoutes } from "./routes/project-review-routes.mjs";

export const createRequestHandler = ({
  token, project, projectRoot, device, observerPort, conversations, execution, media, realtime, submissions,
  followUpQueue, contextManagement, groupRoom, roomDirectory, multiAgent, multiAgentDirectory, artifacts, webOutputs, fushengUsage, readWebVersion, serveStatic,
  agentConversationStore, agentPublicationService,
  employeeRuntime, employeeProjectDirectory, employeeGrowth, modelProviders, projectActivityIndex, projectStatus,
}) => {
  const routes = [
    createVersionRoutes({ readWebVersion }),
    createArtifactRoutes({ groupRoom, roomDirectory, artifacts, webOutputs }),
    createAgentPublicationRoutes({
      conversationStore: agentConversationStore,
      publicationService: agentPublicationService,
      employeeRuntime,
    }),
    ...(employeeRuntime ? [createEmployeeRoutes({ employeeRuntime })] : []),
    ...(employeeProjectDirectory ? [createEmployeeProjectDirectoryRoutes({ directory: employeeProjectDirectory })] : []),
    ...(employeeGrowth ? [createEmployeeGrowthRoutes({ growth: employeeGrowth })] : []),
    ...(projectActivityIndex ? [createProjectReviewRoutes({ activityIndex: projectActivityIndex, projectStatus })] : []),
    createGroupRoutes({ groupRoom, roomDirectory, media, multiAgent, multiAgentDirectory, webOutputs }),
    createFollowUpQueueRoutes({ queue: followUpQueue, media }),
    createConversationRoutes({
      conversations, execution, followUpQueue, contextManagement, media, submissionStore: submissions,
      broadcast: realtime.broadcast,
      publishThreadEvent: execution.publishThreadEvent,
      agentConversationStore,
      employeeRuntime,
      roomDirectory,
      modelProviders,
    }),
    createUsageRoutes({ fushengUsage }),
    createSystemRoutes({ token, project, projectRoot, device, observerPort, media, realtime }),
  ];

  return async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    rememberAuthorizedDevice(request, response, url, token);
    const protectedRoute = url.pathname.startsWith("/api/") || url.pathname === "/events";
    if (protectedRoute && !authorized(request, token)) {
      response.writeHead(401);
      response.end("Unauthorized");
      return;
    }

    try {
      for (const route of routes) {
        if (await route(request, response, url)) return;
      }
      await serveStatic(url, response);
    } catch (error) {
      sendJson(response, { error: error instanceof Error ? error.message : String(error) }, error?.statusCode || 503);
    }
  };
};
