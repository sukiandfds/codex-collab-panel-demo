import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { AppShell } from "../../components/AppShell/AppShell";
import { SidebarHeader } from "../../components/Sidebar/SidebarHeader";
import { WindowBar } from "../../components/WindowBar/WindowBar";
import type { ViewSurface } from "../../components/ViewSwitcher/ViewSwitcher";
import { GroupComposer } from "./components/GroupComposer";
import { GroupHeader } from "./components/GroupHeader";
import { MemberDialog } from "./components/MemberDialog";
import { MemberProfileDrawer } from "./components/MemberProfileDrawer";
import { MessageTimeline } from "./components/MessageTimeline";
import { useGroupRoom } from "./hooks/useGroupRoom";
import type { GroupProfile } from "./model/types";
import { useDeviceInfo } from "../device/hooks/useDeviceInfo";
import { useArtifacts } from "../artifacts/hooks/useArtifacts";
import { projectDirectoryApi } from "../project-directory/data/projectDirectoryApi";
import type { DirectoryProject } from "../project-directory/model/types";
import { ProjectNavigationDirectory } from "../project-directory/components/ProjectDirectory";
import { readLocalCache, writeLocalCache } from "../../shared/state/localCache";
import { RefreshNotice } from "../app-update/components/AppUpdateNotice";
import styles from "./GroupApp.module.css";

const projectDirectoryCacheKey = "negus-project-directory-v1";
const validProjects = (value: unknown): value is DirectoryProject[] => Array.isArray(value)
  && value.every((entry) => Boolean(entry) && typeof entry === "object" && typeof entry.id === "string");

export function GroupApp({ active = true, onViewChange }: { active?: boolean; onViewChange?: (surface: Exclude<ViewSurface, "progress">) => void }) {
  const group = useGroupRoom();
  const device = useDeviceInfo(group.connected);
  const [profile, setProfile] = useState<GroupProfile | null>(null);
  const [projects, setProjects] = useState<DirectoryProject[]>(() => (
    readLocalCache(projectDirectoryCacheKey, validProjects) || []
  ));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [localSendVersion, setLocalSendVersion] = useState(0);
  const snapshot = group.snapshot;
  const artifactIds = useMemo(() => snapshot?.messages.flatMap((message) => message.artifactIds || []) || [], [snapshot?.messages]);
  const artifactState = useArtifacts(artifactIds, group.artifactEvent);
  const join = async (name: string) => {
    await group.join(name);
  };
  const sendMessage = useCallback(async (text: string, attachmentIds: string[] = []) => {
    const accepted = await group.send(text, attachmentIds);
    if (accepted) setLocalSendVersion((version) => version + 1);
    return accepted;
  }, [group.send]);

  useEffect(() => {
    if (!active || !group.initialSyncReady) return;
    window.dispatchEvent(new Event("negus:app-ready"));
  }, [active, group.initialSyncReady]);

  const agents = snapshot?.agents || [];
  const members = snapshot?.members || [];
  const sidebarProjects = useMemo<DirectoryProject[]>(() => projects.length ? projects : group.rooms.map((room) => ({
    id: room.projectId,
    projectId: room.projectId,
    name: room.name.replace(/\s*项目群$/u, ""),
    kind: "personal",
  })), [group.rooms, projects]);
  const activeProjectId = sidebarProjects.find((entry) => entry.kind !== "employee"
    && (entry.projectId || entry.id) === snapshot?.projectId)?.id || "";
  const activeProject = sidebarProjects.find((entry) => entry.id === activeProjectId);
  const sidebarWorkspaceName = activeProject?.root?.split(/[\\/]/u).filter(Boolean).slice(-1)[0]
    || activeProject?.name
    || snapshot?.project
    || "Negus";

  useEffect(() => {
    const controller = new AbortController();
    void projectDirectoryApi.list(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setProjects(next);
          writeLocalCache(projectDirectoryCacheKey, next);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <>
      <AppShell
        chrome={<WindowBar />}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
        sidebar={
          <div className={styles.sidebarContent}>
            <SidebarHeader />
            <ProjectNavigationDirectory
              workspaceName={sidebarWorkspaceName}
              projects={sidebarProjects}
              activeProjectId={activeProjectId}
              onProjectOpen={(project) => {
                const projectId = project.projectId || project.id;
                const room = group.rooms.find((entry) => entry.projectId === projectId)
                  || (snapshot?.projectId === projectId ? snapshot.room : null);
                if (room) group.selectRoom(room.id);
              }}
              onEmployeeOpen={(project) => {
                const agent = agents.find((entry) => entry.id === project.employeeId);
                if (agent) setProfile({ kind: "agent", profile: agent });
              }}
              onOpened={() => setSidebarOpen(false)}
            />
          </div>
        }
        header={
          <GroupHeader
            roomName={snapshot?.room.name || "Negus 项目群"}
            roomId={snapshot?.room.id || ""}
            projectId={snapshot?.projectId || ""}
            connected={group.connected}
            deviceName={device?.name}
            members={members}
            agents={agents}
            historyNotice={group.historyNotice}
            onDateSelect={group.jumpToDate}
            onOpenSidebar={() => setSidebarOpen(true)}
            onViewChange={onViewChange}
          />
        }
        conversation={snapshot ? (
          <MessageTimeline
            active={active}
            roomId={snapshot.room.id}
            messages={snapshot.messages}
            agents={agents}
            members={members}
            currentMemberId={group.member?.id || ""}
            streaming={group.streaming}
            artifacts={artifactState.artifacts}
            artifactLoadErrors={artifactState.loadErrors}
            reviewingArtifactIds={artifactState.reviewingIds}
            reviewerName={group.member?.name || "当前成员"}
            onRetryArtifact={artifactState.loadOne}
            onReviewArtifact={artifactState.review}
            onOpenProfile={setProfile}
            localSendVersion={localSendVersion}
            history={snapshot.history}
            historyLoading={group.historyLoading}
            historyNavigation={group.historyNavigation}
            onLoadOlder={group.loadOlder}
            onLoadNewer={group.loadNewer}
            onReturnToLatest={group.returnToLatest}
          />
        ) : group.error ? (
          <main className={styles.loading}>
            <RefreshNotice
              surface="group"
              title="项目群暂时未连接"
              detail="连接没有响应，请刷新网页后重试。"
              actionLabel="刷新网页"
              onAction={() => window.location.reload()}
            />
          </main>
        ) : <main className={styles.loading} role="status" aria-label="正在连接项目群"><LoaderCircle className={styles.spinner} aria-hidden="true" /></main>}
        composer={snapshot ? (
        <GroupComposer
          agents={agents}
          members={members}
          disabled={!group.member || group.sending}
          error={group.error}
          onSend={sendMessage}
          onInterrupt={group.interrupt}
        />
        ) : <div className={styles.composerPlaceholder} />}
      />
      <MemberDialog initialName={group.member?.name || ""} open={!group.member} onSubmit={join} />
      <MemberProfileDrawer
        profile={profile}
        roomId={group.roomId}
        onClose={() => setProfile(null)}
        onAgentUpdated={(agent) => setProfile({ kind: "agent", profile: agent })}
      />
    </>
  );
}
