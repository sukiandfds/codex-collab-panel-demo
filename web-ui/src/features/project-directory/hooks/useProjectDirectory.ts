import { useCallback, useEffect, useState } from "react";
import { projectDirectoryApi } from "../data/projectDirectoryApi";
import type { DirectoryProject } from "../model/types";

const REFRESH_MS = 5000;

export function useProjectDirectory() {
  const [projects, setProjects] = useState<DirectoryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await projectDirectoryApi.list(signal);
      setProjects(next);
      setError("");
    } catch (reason) {
      if (signal?.aborted) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onGrowthOrStatus = () => void refresh();
    window.addEventListener("negus:project-status-changed", onGrowthOrStatus);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("negus:project-status-changed", onGrowthOrStatus);
    };
  }, [refresh]);

  return { projects, loading, error, refresh };
}
