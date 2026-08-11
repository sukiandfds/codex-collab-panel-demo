import { useCallback, useEffect, useState } from "react";
import { readLocalCache, writeLocalCache } from "../../../shared/state/localCache";
import { modelApi } from "../data/modelApi";
import type { CodexModel } from "../model/types";

const modelsCacheKey = "negus-models-v1";
const validModels = (value: unknown): value is CodexModel[] => Array.isArray(value)
  && value.every((entry) => Boolean(entry)
    && typeof entry === "object"
    && typeof entry.model === "string"
    && Array.isArray(entry.supportedReasoningEfforts));

export function useModels(threadId: string, onChanged: () => void) {
  const [initialModels] = useState(() => readLocalCache(modelsCacheKey, validModels) || []);
  const [models, setModels] = useState<CodexModel[]>(initialModels);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void modelApi.list(controller.signal)
      .then((result) => {
        setModels(result);
        writeLocalCache(modelsCacheKey, result);
        setError("");
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const change = useCallback(async (model: string) => {
    if (!threadId || !model || changing) return false;
    setChanging(true);
    setError("");
    try {
      await modelApi.update(threadId, model);
      onChanged();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setChanging(false);
    }
  }, [changing, onChanged, threadId]);

  const changeReasoningEffort = useCallback(async (reasoningEffort: string) => {
    if (!threadId || !reasoningEffort || changing) return false;
    setChanging(true);
    setError("");
    try {
      await modelApi.updateReasoningEffort(threadId, reasoningEffort);
      onChanged();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setChanging(false);
    }
  }, [changing, onChanged, threadId]);

  return { models, loading, changing, error, change, changeReasoningEffort };
}
