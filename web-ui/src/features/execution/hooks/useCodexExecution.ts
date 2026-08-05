import { useCallback, useEffect, useRef, useState } from "react";
import { executionApi } from "../data/executionApi";
import type { SendMessageAttempt, SubmissionStatusResult } from "../data/executionApi";
import type { ExecutionStatus, ProjectEvent } from "../model/types";

const SEND_CONFIRM_TIMEOUT_MS = 20000;
const SEND_SLOW_NOTICE_MS = 3000;
const MAX_RETIRED_TURNS = 20;

type RefreshStatus = (signal?: AbortSignal, reconcile?: boolean) => Promise<ExecutionStatus | null>;

const createFallbackSubmissionId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

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
  durationMs: null,
});

const recoveringStatus = (threadId: string): ExecutionStatus => ({
  ...idleStatus(threadId),
  phase: "recovering",
  label: "正在确认任务状态",
});

export function useCodexExecution(threadId: string) {
  const [status, setStatus] = useState<ExecutionStatus>(() => idleStatus(threadId));
  const [streamingText, setStreamingText] = useState("");
  const [commentaryText, setCommentaryText] = useState("");
  const streamingItemId = useRef("");
  const streamingBuffer = useRef("");
  const streamingTimer = useRef(0);
  const sendingSlowTimer = useRef(0);
  const sendingRef = useRef(false);
  const currentTurnIdRef = useRef("");
  const retiredTurnIdsRef = useRef(new Set<string>());
  const stateRevisionRef = useRef(0);
  const statusRequestRef = useRef(0);
  const statusInFlightRef = useRef<{ threadId: string; promise: Promise<ExecutionStatus | null> } | null>(null);
  const pendingReconcileRef = useRef(false);
  const refreshStatusRef = useRef<RefreshStatus>(async () => null);
  const activeEventEpochRef = useRef("");
  const knownEventEpochsRef = useRef(new Set<string>());
  const lastEventSeqRef = useRef(0);
  const [sending, setSending] = useState(false);
  const [sendingSlow, setSendingSlow] = useState(false);

  const clearStreaming = useCallback(() => {
    window.clearTimeout(streamingTimer.current);
    streamingTimer.current = 0;
    streamingBuffer.current = "";
    streamingItemId.current = "";
    setStreamingText("");
  }, []);

  const retireTurn = useCallback((turnId: string) => {
    if (!turnId) return;
    retiredTurnIdsRef.current.add(turnId);
    while (retiredTurnIdsRef.current.size > MAX_RETIRED_TURNS) {
      const oldest = retiredTurnIdsRef.current.values().next().value;
      if (!oldest) break;
      retiredTurnIdsRef.current.delete(oldest);
    }
  }, []);

  const applyStatus = useCallback((next: ExecutionStatus, revision = stateRevisionRef.current) => {
    if (revision !== stateRevisionRef.current) return false;
    if (next.turnId && retiredTurnIdsRef.current.has(next.turnId)) return false;
    const previousTurnId = currentTurnIdRef.current;
    if (next.turnId && previousTurnId && next.turnId !== previousTurnId) {
      retireTurn(previousTurnId);
      clearStreaming();
      setCommentaryText("");
    }
    if (next.turnId) currentTurnIdRef.current = next.turnId;
    stateRevisionRef.current += 1;
    const preserveTerminalStream = ["completed", "idle"].includes(next.phase)
      && !next.streamingText
      && Boolean(streamingBuffer.current)
      && Boolean(streamingItemId.current);
    setStatus({
      ...next,
      turnId: next.turnId || "",
      activities: next.activities || [],
      streamingItemId: preserveTerminalStream ? streamingItemId.current : next.streamingItemId || "",
    });
    setCommentaryText(next.commentary || "");
    if (next.streamingText !== undefined && !preserveTerminalStream) {
      window.clearTimeout(streamingTimer.current);
      streamingTimer.current = 0;
      streamingItemId.current = next.streamingItemId || "";
      streamingBuffer.current = next.streamingText;
      setStreamingText(next.streamingText);
    }
    return true;
  }, [clearStreaming, retireTurn]);

  const refreshStatus = useCallback(async (signal?: AbortSignal, reconcile = false) => {
    if (!threadId) return null;
    const inFlight = statusInFlightRef.current;
    if (inFlight?.threadId === threadId) {
      if (reconcile) pendingReconcileRef.current = true;
      return inFlight.promise;
    }
    const requestId = ++statusRequestRef.current;
    const revision = stateRevisionRef.current;
    const request = (async () => {
      try {
        const next = await executionApi.status(threadId, signal, reconcile);
        if (requestId !== statusRequestRef.current || revision !== stateRevisionRef.current) return null;
        return applyStatus(next, revision) ? next : null;
      } catch {
        return null;
      }
    })();
    const entry = { threadId, promise: request };
    statusInFlightRef.current = entry;
    void request.finally(() => {
      if (statusInFlightRef.current !== entry) return;
      statusInFlightRef.current = null;
      if (pendingReconcileRef.current) {
        pendingReconcileRef.current = false;
        window.setTimeout(() => { void refreshStatusRef.current(undefined, true); }, 0);
      }
    }).catch(() => {});
    return request;
  }, [applyStatus, threadId]);
  refreshStatusRef.current = refreshStatus;

  const acceptEventSequence = useCallback((event: ProjectEvent) => {
    const sequencedEvent = event as ProjectEvent & { eventEpoch?: unknown; eventSeq?: unknown };
    const eventEpoch = typeof sequencedEvent.eventEpoch === "string" ? sequencedEvent.eventEpoch : "";
    const eventSeq = typeof sequencedEvent.eventSeq === "number" && Number.isSafeInteger(sequencedEvent.eventSeq)
      ? sequencedEvent.eventSeq
      : 0;
    if (!eventEpoch || !eventSeq) return true;
    if (!activeEventEpochRef.current) {
      activeEventEpochRef.current = eventEpoch;
      knownEventEpochsRef.current.add(eventEpoch);
    } else if (activeEventEpochRef.current !== eventEpoch) {
      if (knownEventEpochsRef.current.has(eventEpoch)) return false;
      activeEventEpochRef.current = eventEpoch;
      knownEventEpochsRef.current.add(eventEpoch);
      while (knownEventEpochsRef.current.size > 3) {
        const oldestEpoch = knownEventEpochsRef.current.values().next().value;
        if (!oldestEpoch) break;
        knownEventEpochsRef.current.delete(oldestEpoch);
      }
      lastEventSeqRef.current = 0;
    }
    if (eventSeq <= lastEventSeqRef.current) return false;
    lastEventSeqRef.current = eventSeq;
    return true;
  }, []);

  useEffect(() => {
    statusRequestRef.current += 1;
    stateRevisionRef.current += 1;
    pendingReconcileRef.current = false;
    currentTurnIdRef.current = "";
    retiredTurnIdsRef.current.clear();
    activeEventEpochRef.current = "";
    knownEventEpochsRef.current.clear();
    lastEventSeqRef.current = 0;
    clearStreaming();
    setCommentaryText("");
    setStatus(threadId ? recoveringStatus(threadId) : idleStatus(threadId));
    if (!threadId) {
      return;
    }
    const controller = new AbortController();
    void refreshStatus(controller.signal);
    return () => controller.abort();
  }, [clearStreaming, refreshStatus, threadId]);

  useEffect(() => () => {
    window.clearTimeout(streamingTimer.current);
    window.clearTimeout(sendingSlowTimer.current);
  }, []);

  const handleEvent = useCallback((event: ProjectEvent) => {
    if (!("threadId" in event) || event.threadId !== threadId) return;
    if (!acceptEventSequence(event)) return;
    if (event.type === "execution_status") {
      if (!applyStatus(event)) return;
      if (["failed", "interrupted", "systemError"].includes(event.phase)) {
        clearStreaming();
        setCommentaryText("");
      }
      return;
    }
    if (event.type === "assistant_commentary") {
      if (!event.turnId || event.turnId !== currentTurnIdRef.current || retiredTurnIdsRef.current.has(event.turnId)) return;
      stateRevisionRef.current += 1;
      setCommentaryText(event.text);
      return;
    }
    if (event.type === "assistant_delta") {
      if (!event.turnId || event.turnId !== currentTurnIdRef.current || retiredTurnIdsRef.current.has(event.turnId)) return;
      stateRevisionRef.current += 1;
      if (streamingItemId.current !== event.itemId) streamingBuffer.current = event.delta;
      else streamingBuffer.current += event.delta;
      streamingItemId.current = event.itemId;
      setStatus((current) => current.turnId === event.turnId
        ? { ...current, streamingItemId: event.itemId, updatedAt: new Date().toISOString() }
        : current);
      if (!streamingTimer.current) {
        streamingTimer.current = window.setTimeout(() => {
          streamingTimer.current = 0;
          setStreamingText(streamingBuffer.current);
        }, 100);
      }
      return;
    }
  }, [acceptEventSequence, applyStatus, clearStreaming, threadId]);

  const sendMessage = useCallback(async (
    text: string,
    attachmentIds: string[] = [],
    submissionId = "",
  ): Promise<SendMessageAttempt | null> => {
    const message = text.trim();
    if (!threadId || (!message && !attachmentIds.length) || sendingRef.current) return null;
    sendingRef.current = true;
    setSending(true);
    setSendingSlow(false);
    const acceptedSubmissionId = submissionId || createFallbackSubmissionId();
    sendingSlowTimer.current = window.setTimeout(() => setSendingSlow(true), SEND_SLOW_NOTICE_MS);
    const steering = status.active;
    const previousTurnId = status.turnId;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SEND_CONFIRM_TIMEOUT_MS);
    if (!steering) {
      retireTurn(currentTurnIdRef.current || previousTurnId);
      currentTurnIdRef.current = "";
      stateRevisionRef.current += 1;
      clearStreaming();
      setCommentaryText("");
      const submittedAt = new Date().toISOString();
      setStatus({
        ...idleStatus(threadId),
        phase: "submitted",
        label: "Sending to Codex",
        active: true,
        startedAt: submittedAt,
        updatedAt: submittedAt,
      });
    } else {
      stateRevisionRef.current += 1;
      setStatus((current) => ({
        ...current,
        label: "Sending guidance...",
        detail: "",
        updatedAt: new Date().toISOString(),
      }));
    }
    try {
      const accepted = await executionApi.sendMessage(threadId, message, attachmentIds, acceptedSubmissionId, controller.signal);
      if (accepted.status === "pending") {
        stateRevisionRef.current += 1;
        setStatus((current) => ({
          ...current,
          phase: "unknown",
          label: "正在确认指令是否已送达",
          detail: "服务端尚未确认这条指令，不会重复提交",
          active: true,
          updatedAt: new Date().toISOString(),
        }));
        return { outcome: "uncertain", result: null };
      }
      if (accepted.threadId !== threadId) return { outcome: "accepted", result: accepted };
      if (accepted.turnId) {
        currentTurnIdRef.current = accepted.turnId;
        stateRevisionRef.current += 1;
        setStatus((current) => ({
          ...current,
          turnId: accepted.turnId,
          phase: current.phase === "submitted" ? "working" : current.phase,
          active: true,
          updatedAt: new Date().toISOString(),
        }));
      }
      return { outcome: "accepted", result: accepted };
    } catch (reason) {
      const recovered = await refreshStatus(undefined, true);
      const acceptedAfterFailure = !steering
        && Boolean(recovered?.turnId)
        && recovered?.turnId !== previousTurnId
        && !["failed", "systemError"].includes(recovered?.phase || "");
      if (acceptedAfterFailure) {
        return {
          outcome: "accepted",
          result: { threadId, turnId: recovered?.turnId || "", status: recovered?.phase || "inProgress" },
        };
      }
      const uncertain = controller.signal.aborted;
      const detail = uncertain
        ? "发送确认超时，未重复提交；请确认任务状态后重试"
        : reason instanceof Error ? reason.message : String(reason);
      if (steering) {
        setStatus((current) => uncertain
          ? { ...current, phase: "unknown", label: "正在确认指令是否已送达", detail }
          : { ...current, detail });
      } else {
        setStatus({
          ...idleStatus(threadId),
          phase: uncertain ? "unknown" : "failed",
          label: uncertain ? "正在确认指令是否已送达" : "指令发送失败",
          detail,
          updatedAt: new Date().toISOString(),
        });
      }
      return { outcome: uncertain ? "uncertain" : "failed", result: null };
    } finally {
      window.clearTimeout(timeout);
      window.clearTimeout(sendingSlowTimer.current);
      sendingSlowTimer.current = 0;
      setSendingSlow(false);
      sendingRef.current = false;
      setSending(false);
    }
  }, [clearStreaming, refreshStatus, retireTurn, status.active, threadId]);

  const reconcileSubmission = useCallback(async (submissionId: string, signal?: AbortSignal): Promise<SubmissionStatusResult | null> => {
    if (!threadId || !submissionId) return null;
    try {
      return await executionApi.submissionStatus(threadId, submissionId, signal);
    } catch {
      return null;
    }
  }, [threadId]);

  const interrupt = useCallback(async () => {
    if (!threadId || !status.active || sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    setStatus((current) => ({
      ...current,
      phase: "stopping",
      label: "正在停止",
      detail: "",
      active: true,
    }));
    try {
      await executionApi.interrupt(threadId);
      return true;
    } catch (reason) {
      const recovered = await refreshStatus(undefined, true);
      if (!recovered) {
        setStatus((current) => ({
          ...current,
          phase: "unknown",
          label: "停止状态待确认",
          detail: reason instanceof Error ? reason.message : String(reason),
          active: true,
        }));
      }
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [refreshStatus, status.active, threadId]);

  return { status, streamingText, commentaryText, sending, sendingSlow, handleEvent, sendMessage, reconcileSubmission, interrupt, clearStreaming, refreshStatus };
}
