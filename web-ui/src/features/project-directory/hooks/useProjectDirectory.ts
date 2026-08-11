import { useCallback, useEffect, useRef, useState } from "react";
import { hasAccessToken, withAccessToken } from "../../../shared/api/http";
import { readLocalCache, writeLocalCache } from "../../../shared/state/localCache";
import type { ExecutionStatus } from "../../execution/model/types";
import { projectDirectoryApi } from "../data/projectDirectoryApi";
import type { DirectoryProject, ProjectRuntimeStatus } from "../model/types";

type StatusByThread = Record<string, ProjectRuntimeStatus>;
const projectDirectoryCacheKey = "negus-project-directory-v1";
const validProjects = (value: unknown): value is DirectoryProject[] => Array.isArray(value)
  && value.every((entry) => Boolean(entry) && typeof entry === "object" && typeof entry.id === "string");
type DirectoryEvent = {
  type?: string;
  employeeId?: string;
  threadId?: string;
  status?: ProjectRuntimeStatus;
  phase?: string;
  label?: string;
  active?: boolean;
  turnId?: string | null;
};

const sameStatus = (left?: ProjectRuntimeStatus, right?: ProjectRuntimeStatus) => (
  String(left?.phase || "") === String(right?.phase || "")
  && Boolean(left?.active) === Boolean(right?.active)
  && String(left?.turnId || "") === String(right?.turnId || "")
);

export function useProjectDirectory(currentStatus?: ExecutionStatus) {
  const [initialProjects] = useState(() => readLocalCache(projectDirectoryCacheKey, validProjects) || []);
  const [projects, setProjects] = useState<DirectoryProject[]>(initialProjects);
  const [statusByThread, setStatusByThread] = useState<StatusByThread>({});
  const [loading, setLoading] = useState(!initialProjects.length);
  const [error, setError] = useState("");
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const cacheStatus = useCallback((threadId: string, status?: ProjectRuntimeStatus | null) => {
    if (!threadId || !status) return;
    setStatusByThread((current) => sameStatus(current[threadId], status)
      ? current
      : { ...current, [threadId]: status });
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await projectDirectoryApi.list(signal);
      setProjects((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      writeLocalCache(projectDirectoryCacheKey, next);
      for (const entry of next) {
        if (entry.mainThreadId) cacheStatus(entry.mainThreadId, entry.status);
        for (const conversation of entry.conversations || []) {
          cacheStatus(conversation.threadId || conversation.id, conversation.status);
        }
      }
      setError("");
    } catch (reason) {
      if (signal?.aborted) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [cacheStatus]);

  useEffect(() => {
    if (!currentStatus?.threadId) return;
    cacheStatus(currentStatus.threadId, currentStatus);
  }, [cacheStatus, currentStatus]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    if (!hasAccessToken || typeof EventSource === "undefined") return () => controller.abort();
    const source = new EventSource(withAccessToken("/events"));
    let refreshTimer = 0;
    const scheduleActivityRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh(), 180);
    };
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as DirectoryEvent;
        if (payload.type === "execution_status" && payload.threadId) {
          cacheStatus(payload.threadId, payload);
          return;
        }
        if (payload.type === "employee_status") {
          const employeeProject = projectsRef.current.find((entry) => entry.employeeId === payload.employeeId);
          if (employeeProject?.mainThreadId) cacheStatus(employeeProject.mainThreadId, payload.status);
          return;
        }
        if (payload.type === "sessions_changed" || payload.type === "employee_message_completed") scheduleActivityRefresh();
      } catch { /* Existing conversation SSE remains the source of truth. */ }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("pageshow", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      controller.abort();
      source.close();
      window.clearTimeout(refreshTimer);
      window.removeEventListener("pageshow", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [cacheStatus, refresh]);

  return { projects, statusByThread, loading, error, refresh };
}
