import { useCallback, useEffect, useMemo, useState } from "react";
import { artifactApi } from "../data/artifactApi";
import type { Artifact, ArtifactRealtimeEvent, ArtifactReviewDecision } from "../model/types";

export function useArtifacts(artifactIds: string[], event: ArtifactRealtimeEvent | null) {
  const [artifacts, setArtifacts] = useState<Record<string, Artifact>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, boolean>>({});
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());
  const idsKey = useMemo(() => [...new Set(artifactIds)].sort().join("\n"), [artifactIds]);

  const loadOne = useCallback(async (artifactId: string, signal?: AbortSignal) => {
    setLoadErrors((current) => {
      const next = { ...current };
      delete next[artifactId];
      return next;
    });
    try {
      const artifact = await artifactApi.get(artifactId, signal);
      setArtifacts((current) => ({ ...current, [artifact.id]: artifact }));
    } catch (reason) {
      if ((reason as Error)?.name !== "AbortError") {
        setLoadErrors((current) => ({ ...current, [artifactId]: true }));
      }
      throw reason;
    }
  }, []);

  useEffect(() => {
    const ids = idsKey ? idsKey.split("\n") : [];
    if (!ids.length) return;
    const controller = new AbortController();
    void Promise.allSettled(ids.map((id) => loadOne(id, controller.signal)));
    return () => controller.abort();
  }, [idsKey, loadOne]);

  useEffect(() => {
    if (!event || !artifactIds.includes(event.artifactId)) return;
    const controller = new AbortController();
    void loadOne(event.artifactId, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [artifactIds, event, loadOne]);

  const review = useCallback(async (artifactId: string, decision: ArtifactReviewDecision, note: string, reviewedBy: string) => {
    setReviewingIds((current) => new Set(current).add(artifactId));
    try {
      const artifact = await artifactApi.review(artifactId, decision, note, reviewedBy);
      setArtifacts((current) => ({ ...current, [artifact.id]: artifact }));
    } finally {
      setReviewingIds((current) => {
        const next = new Set(current);
        next.delete(artifactId);
        return next;
      });
    }
  }, []);

  return { artifacts, loadErrors, reviewingIds, loadOne, review };
}
