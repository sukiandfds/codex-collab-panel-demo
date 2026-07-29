import { useCallback, useEffect, useRef, useState } from "react";
import { executionApi } from "../data/executionApi";
import type { ExecutionStatus, ProjectEvent } from "../model/types";

const SEND_CONFIRM_TIMEOUT_MS = 20000;

const idleStatus = (threadId: string): ExecutionStatus => ({
  type: "execution_status",
  threadId,
  turnId: "",
  phase: "idle",
  label: "Codex 已就绪",
  detail: "",
  commentary: "",
  streamingItemId: "",
  streamingText: "",
  activities: [],
  active: false,
  startedAt: null,
  updatedAt: null,
});

export function useCodexExecution(threadId: string, onMessageAccepted: () => void) {
  const [status, setStatus] = useState<ExecutionStatus>(() => idleStatus(threadId));
  const [streamingText, setStreamingText] = useState("");
  const [commentaryText, setCommentaryText] = useState("");
  const streamingItemId = useRef("");
  const streamingBuffer = useRef("");
  const streamingTimer = useRef(0);
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);

  const clearStreaming = useCallback(() => {
    window.clearTimeout(streamingTimer.current);
    streamingTimer.current = 0;
    streamingBuffer.current = "";
    streamingItemId.current = "";
    setStreamingText("");
  }, []);

  const applyStatus = useCallback((next: ExecutionStatus) => {
    setStatus({ ...next, turnId: next.turnId || "", activities: next.activities || [] });
    setCommentaryText(next.commentary || "");
    const preserveCompletedStream = next.phase === "completed"
      && !next.streamingText
      && Boolean(streamingBuffer.current);
    if (next.streamingText !== undefined && !preserveCompletedStream) {
      window.clearTimeout(streamingTimer.current);
      streamingTimer.current = 0;
      streamingItemId.current = next.streamingItemId || "";
      streamingBuffer.current = next.streamingText;
      setStreamingText(next.streamingText);
    }
  }, []);

  const refreshStatus = useCallback(async (signal?: AbortSignal, reconcile = false) => {
    if (!threadId) return null;
    try {
      const next = await executionApi.status(threadId, signal, reconcile);
      applyStatus(next);
      return next;
    } catch {
      return null;
    }
  }, [applyStatus, threadId]);

  useEffect(() => {
    clearStreaming();
    setCommentaryText("");
    setStatus(idleStatus(threadId));
    if (!threadId) {
      return;
    }
    const controller = new AbortController();
    void refreshStatus(controller.signal);
    return () => controller.abort();
  }, [clearStreaming, refreshStatus, threadId]);

  useEffect(() => () => {
    window.clearTimeout(streamingTimer.current);
  }, []);

  const handleEvent = useCallback((event: ProjectEvent) => {
    if (!("threadId" in event) || event.threadId !== threadId) return;
    if (event.type === "execution_status") {
      applyStatus(event);
      if (["failed", "interrupted", "systemError"].includes(event.phase)) {
        clearStreaming();
        setCommentaryText("");
      }
      return;
    }
    if (event.type === "assistant_commentary") {
      setCommentaryText(event.text);
      return;
    }
    if (event.type === "assistant_delta") {
      if (streamingItemId.current !== event.itemId) streamingBuffer.current = event.delta;
      else streamingBuffer.current += event.delta;
      streamingItemId.current = event.itemId;
      if (!streamingTimer.current) {
        streamingTimer.current = window.setTimeout(() => {
          streamingTimer.current = 0;
          setStreamingText(streamingBuffer.current);
        }, 100);
      }
      return;
    }
  }, [applyStatus, clearStreaming, threadId]);

  const sendMessage = useCallback(async (text: string, attachmentIds: string[] = []) => {
    const message = text.trim();
    if (!threadId || (!message && !attachmentIds.length) || sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    const steering = status.active;
    const previousTurnId = status.turnId;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SEND_CONFIRM_TIMEOUT_MS);
    if (!steering) {
      clearStreaming();
      setCommentaryText("");
    }
    try {
      await executionApi.sendMessage(threadId, message, attachmentIds, controller.signal);
      onMessageAccepted();
      void refreshStatus();
      return true;
    } catch (reason) {
      const recovered = await refreshStatus();
      const acceptedAfterFailure = !steering
        && Boolean(recovered?.turnId)
        && recovered?.turnId !== previousTurnId
        && !["failed", "systemError"].includes(recovered?.phase || "");
      if (acceptedAfterFailure) {
        onMessageAccepted();
        return true;
      }
      const detail = controller.signal.aborted
        ? "发送确认超时，未重复提交；请确认任务状态后重试"
        : reason instanceof Error ? reason.message : String(reason);
      if (steering) {
        setStatus((current) => ({ ...current, detail }));
      } else {
        setStatus({
          ...idleStatus(threadId),
          phase: "failed",
          label: "指令发送失败",
          detail,
          updatedAt: new Date().toISOString(),
        });
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
      sendingRef.current = false;
      setSending(false);
    }
  }, [clearStreaming, onMessageAccepted, refreshStatus, status.active, threadId]);

  const interrupt = useCallback(async () => {
    if (!threadId || !status.active || sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    try {
      await executionApi.interrupt(threadId);
      return true;
    } catch (reason) {
      setStatus((current) => ({
        ...current,
        detail: reason instanceof Error ? reason.message : String(reason),
      }));
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [status.active, threadId]);

  return { status, streamingText, commentaryText, sending, handleEvent, sendMessage, interrupt, clearStreaming, refreshStatus };
}
