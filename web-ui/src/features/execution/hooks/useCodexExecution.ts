import { useCallback, useEffect, useRef, useState } from "react";
import { executionApi } from "../data/executionApi";
import type { ExecutionStatus, ProjectEvent } from "../model/types";

const idleStatus = (threadId: string): ExecutionStatus => ({
  type: "execution_status",
  threadId,
  phase: "idle",
  label: "Codex 已就绪",
  detail: "",
  active: false,
  startedAt: null,
  updatedAt: null,
});

export function useCodexExecution(threadId: string, onMessageAccepted: () => void) {
  const [status, setStatus] = useState<ExecutionStatus>(() => idleStatus(threadId));
  const [streamingText, setStreamingText] = useState("");
  const [commentaryText, setCommentaryText] = useState("");
  const streamingItemId = useRef("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setStreamingText("");
    setCommentaryText("");
    streamingItemId.current = "";
    if (!threadId) {
      setStatus(idleStatus(""));
      return;
    }
    const controller = new AbortController();
    executionApi.status(threadId, controller.signal)
      .then(setStatus)
      .catch(() => setStatus(idleStatus(threadId)));
    return () => controller.abort();
  }, [threadId]);

  const handleEvent = useCallback((event: ProjectEvent) => {
    if (!("threadId" in event) || event.threadId !== threadId) return;
    if (event.type === "execution_status") {
      setStatus(event);
      if (["completed", "failed", "interrupted", "systemError"].includes(event.phase)) {
        setStreamingText("");
        setCommentaryText("");
        streamingItemId.current = "";
      }
      return;
    }
    if (event.type === "assistant_commentary") {
      setCommentaryText(event.text);
      return;
    }
    if (event.type === "assistant_delta") {
      if (streamingItemId.current !== event.itemId) setStreamingText(event.delta);
      else setStreamingText((text) => text + event.delta);
      streamingItemId.current = event.itemId;
      return;
    }
    if (event.type === "sessions_changed") {
      setStreamingText("");
      streamingItemId.current = "";
    }
  }, [threadId]);

  const sendMessage = useCallback(async (text: string) => {
    const message = text.trim();
    if (!threadId || !message || sending || status.active) return false;
    setSending(true);
    setCommentaryText("");
    setStatus({
      ...idleStatus(threadId),
      phase: "submitted",
      label: "指令正在发送",
      active: true,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    try {
      await executionApi.sendMessage(threadId, message);
      onMessageAccepted();
      return true;
    } catch (reason) {
      setStatus({
        ...idleStatus(threadId),
        phase: "failed",
        label: "指令发送失败",
        detail: reason instanceof Error ? reason.message : String(reason),
        updatedAt: new Date().toISOString(),
      });
      return false;
    } finally {
      setSending(false);
    }
  }, [onMessageAccepted, sending, status.active, threadId]);

  return { status, streamingText, commentaryText, sending, handleEvent, sendMessage };
}
