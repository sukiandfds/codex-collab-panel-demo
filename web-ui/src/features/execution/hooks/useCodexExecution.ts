import { useCallback, useEffect, useRef, useState } from "react";
import { executionApi } from "../data/executionApi";
import type { ExecutionStatus, ProjectEvent } from "../model/types";

const idleStatus = (threadId: string): ExecutionStatus => ({
  type: "execution_status",
  threadId,
  turnId: "",
  phase: "idle",
  label: "Codex 已就绪",
  detail: "",
  commentary: "",
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
  const streamingFrame = useRef(0);
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);

  const clearStreaming = useCallback(() => {
    if (streamingFrame.current) window.cancelAnimationFrame(streamingFrame.current);
    streamingFrame.current = 0;
    streamingBuffer.current = "";
    streamingItemId.current = "";
    setStreamingText("");
  }, []);

  const applyStatus = useCallback((next: ExecutionStatus) => {
    setStatus({ ...next, turnId: next.turnId || "", activities: next.activities || [] });
    setCommentaryText(next.commentary || "");
  }, []);

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    if (!threadId) return;
    try {
      applyStatus(await executionApi.status(threadId, signal));
    } catch {
      if (!signal?.aborted) applyStatus(idleStatus(threadId));
    }
  }, [applyStatus, threadId]);

  useEffect(() => {
    clearStreaming();
    setCommentaryText("");
    if (!threadId) {
      setStatus(idleStatus(""));
      return;
    }
    const controller = new AbortController();
    void refreshStatus(controller.signal);
    return () => controller.abort();
  }, [clearStreaming, refreshStatus, threadId]);

  useEffect(() => () => {
    if (streamingFrame.current) window.cancelAnimationFrame(streamingFrame.current);
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
      if (!streamingFrame.current) {
        streamingFrame.current = window.requestAnimationFrame(() => {
          streamingFrame.current = 0;
          setStreamingText(streamingBuffer.current);
        });
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
    if (!steering) {
      clearStreaming();
      setCommentaryText("");
      setStatus({
        ...idleStatus(threadId),
        phase: "submitted",
        label: "指令正在发送",
        commentary: "",
        activities: [],
        active: true,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    try {
      await executionApi.sendMessage(threadId, message, attachmentIds);
      onMessageAccepted();
      return true;
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
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
      sendingRef.current = false;
      setSending(false);
    }
  }, [clearStreaming, onMessageAccepted, status.active, threadId]);

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
