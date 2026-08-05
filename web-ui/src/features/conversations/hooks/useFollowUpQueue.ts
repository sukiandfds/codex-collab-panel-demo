import { useCallback, useEffect, useState } from "react";
import type { MediaFile } from "../../../shared/model/media";
import type { ProjectEvent } from "../../execution/model/types";
import { followUpQueueApi } from "../data/followUpQueueApi";
import type { FollowUpQueueItem } from "../model/followUpQueue";
import { createSubmissionId } from "../state/optimisticMessage";

export function useFollowUpQueue(threadId: string) {
  const [items, setItems] = useState<FollowUpQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!threadId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const response = await followUpQueueApi.list(threadId);
      setItems(response.items || []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    setItems([]);
    setError("");
    void refresh();
  }, [refresh]);

  const run = useCallback(async (request: () => Promise<{ items: FollowUpQueueItem[] }>) => {
    setBusy(true);
    try {
      const response = await request();
      setItems(response.items || []);
      setError("");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const enqueue = useCallback(async (text: string, attachments: MediaFile[] = []) => {
    if (!threadId) return false;
    return run(() => followUpQueueApi.enqueue(
      threadId,
      text.trim(),
      attachments.map((attachment) => attachment.id),
      `queue-${createSubmissionId()}`,
    ));
  }, [run, threadId]);

  const edit = useCallback((itemId: string, text: string) => {
    if (!threadId) return Promise.resolve(false);
    return run(() => followUpQueueApi.action(threadId, "edit", itemId, { text: text.trim() }));
  }, [run, threadId]);

  const remove = useCallback((itemId: string) => {
    if (!threadId) return Promise.resolve(false);
    return run(() => followUpQueueApi.action(threadId, "remove", itemId));
  }, [run, threadId]);

  const move = useCallback((itemId: string, direction: "up" | "down") => {
    if (!threadId) return Promise.resolve(false);
    return run(() => followUpQueueApi.action(threadId, "move", itemId, { direction }));
  }, [run, threadId]);

  const retry = useCallback((itemId: string) => {
    if (!threadId) return Promise.resolve(false);
    return run(() => followUpQueueApi.action(threadId, "retry", itemId));
  }, [run, threadId]);

  const sendNow = useCallback((itemId: string) => {
    if (!threadId) return Promise.resolve(false);
    return run(() => followUpQueueApi.action(threadId, "sendNow", itemId));
  }, [run, threadId]);

  const handleEvent = useCallback((event: ProjectEvent) => {
    if (event.type !== "queue_changed" || event.threadId !== threadId) return;
    setItems(event.items || []);
    setError("");
  }, [threadId]);

  return { items, loading, busy, error, enqueue, edit, remove, move, retry, sendNow, refresh, handleEvent };
}
