import { useEffect, useRef, useState } from "react";
import { hasAccessToken, withAccessToken } from "../../../shared/api/http";
import type { RealtimeRecoveryReason } from "../../../shared/model/realtime";
import type { ProjectEvent } from "../../execution/model/types";

const reconnectDelays = [1000, 2000, 5000, 10000];
const staleExecutionRecoveryMs = 30000;
const recoveryPriority: Record<RealtimeRecoveryReason, number> = {
  "stale-execution": 1,
  resumed: 2,
  reconnected: 3,
  "event-gap": 4,
};

const eventIdFrom = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};

const isConversationProgressEvent = (event: ProjectEvent, threadId: string) => {
  if (event.type === "sessions_changed") return !event.threadId || event.threadId === threadId;
  if (["execution_status", "assistant_commentary", "assistant_delta", "context_status", "user_message_submitted", "queue_changed"].includes(event.type)) {
    return "threadId" in event && event.threadId === threadId;
  }
  return false;
};

export function useConversationEvents(
  onSessionsChanged: (threadId?: string) => void,
  onEvent: (event: ProjectEvent) => void,
  onRecover: (reason: RealtimeRecoveryReason) => void,
  threadId: string,
  active: boolean,
  awaitingFirstEvent: boolean,
) {
  const [connected, setConnected] = useState(true);
  const onSessionsChangedRef = useRef(onSessionsChanged);
  const onEventRef = useRef(onEvent);
  const onRecoverRef = useRef(onRecover);
  const threadIdRef = useRef(threadId);
  const activeRef = useRef(active);
  const activeSinceRef = useRef(active ? Date.now() : 0);
  const awaitingFirstEventRef = useRef(awaitingFirstEvent);

  useEffect(() => { onSessionsChangedRef.current = onSessionsChanged; }, [onSessionsChanged]);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onRecoverRef.current = onRecover; }, [onRecover]);
  useEffect(() => {
    threadIdRef.current = threadId;
    if (activeRef.current) activeSinceRef.current = Date.now();
  }, [threadId]);
  useEffect(() => {
    activeRef.current = active;
    if (active) activeSinceRef.current = Date.now();
    if (!active) setConnected(true);
  }, [active]);
  useEffect(() => { awaitingFirstEventRef.current = awaitingFirstEvent; }, [awaitingFirstEvent]);

  useEffect(() => {
    if (!hasAccessToken) return;
    let eventTimer = 0;
    const pendingSessionIds = new Set<string>();
    let pendingAllSessions = false;
    let reconnectTimer = 0;
    let disconnectedTimer = 0;
    let recoveryTimer = 0;
    let events: EventSource | null = null;
    let openedOnce = false;
    let reconnectAttempt = 0;
    let lastEventId = 0;
    let lastTransportAt = Date.now();
    let lastProgressAt = Date.now();
    let lastRecoveryAt = 0;
    let pendingRecovery: RealtimeRecoveryReason | null = null;

    const clearReconnectTimers = () => {
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(disconnectedTimer);
    };
    const requestRecovery = (reason: RealtimeRecoveryReason) => {
      lastRecoveryAt = Date.now();
      if (!pendingRecovery || recoveryPriority[reason] > recoveryPriority[pendingRecovery]) {
        pendingRecovery = reason;
      }
      window.clearTimeout(recoveryTimer);
      recoveryTimer = window.setTimeout(() => {
        const requested = pendingRecovery;
        pendingRecovery = null;
        if (requested) onRecoverRef.current(requested);
      }, 50);
    };
    const connect = () => {
      clearReconnectTimers();
      events?.close();
      const reconnecting = openedOnce;
      let replayGap = false;
      let handshakeComplete = false;
      const eventsPath = lastEventId > 0 ? `/events?lastEventId=${lastEventId}` : "/events";
      const source = new EventSource(withAccessToken(eventsPath));
      events = source;
      if (activeRef.current) {
        disconnectedTimer = window.setTimeout(() => setConnected(false), 5000);
      }
      source.onopen = () => {
        if (events !== source) return;
        openedOnce = true;
        lastTransportAt = Date.now();
        window.clearTimeout(disconnectedTimer);
        setConnected(true);
      };
      source.onerror = () => {
        if (events !== source) return;
        source.close();
        events = null;
        if (activeRef.current) {
          disconnectedTimer = window.setTimeout(() => setConnected(false), 5000);
        }
        const delay = reconnectDelays[Math.min(reconnectAttempt, reconnectDelays.length - 1)];
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
      source.onmessage = (event) => {
        if (events !== source) return;
        lastTransportAt = Date.now();
        window.clearTimeout(disconnectedTimer);
        setConnected(true);
        try {
          const payload = JSON.parse(event.data) as ProjectEvent;
          if (payload.type === "heartbeat") return;
          if (payload.type === "connected") {
            reconnectAttempt = 0;
            const serverEventId = eventIdFrom(payload.eventId);
            const serverGap = payload.gap === true;
            if (serverGap) lastEventId = serverEventId;
            else lastEventId = Math.max(lastEventId, serverEventId);
            if (serverGap || replayGap) {
              console.warn("[realtime] event history gap detected; restoring from server snapshot", {
                requestedEventId: payload.requestedEventId,
                oldestEventId: payload.oldestEventId,
                eventId: payload.eventId,
              });
              requestRecovery("event-gap");
            } else if (reconnecting) {
              requestRecovery("reconnected");
            }
            handshakeComplete = true;
            return;
          }

          const receivedEventId = eventIdFrom(event.lastEventId);
          if (receivedEventId > 0) {
            if (receivedEventId <= lastEventId) return;
            if (lastEventId > 0 && receivedEventId !== lastEventId + 1) {
              replayGap = true;
              if (handshakeComplete) requestRecovery("event-gap");
            }
            lastEventId = receivedEventId;
          }
          if (isConversationProgressEvent(payload, threadIdRef.current)) lastProgressAt = Date.now();
          onEventRef.current(payload);
          if (payload.type === "sessions_changed") {
            if (payload.threadId) pendingSessionIds.add(payload.threadId);
            else pendingAllSessions = true;
            window.clearTimeout(eventTimer);
            eventTimer = window.setTimeout(() => {
              const allSessions = pendingAllSessions;
              const threadIds = [...pendingSessionIds];
              pendingSessionIds.clear();
              pendingAllSessions = false;
              if (allSessions || !threadIds.length) onSessionsChangedRef.current();
              else threadIds.forEach((changedThreadId) => onSessionsChangedRef.current(changedThreadId));
            }, 180);
          }
        } catch {
          console.warn("[realtime] ignored malformed event payload");
        }
      };
    };

    const ensureCurrent = () => {
      if (document.visibilityState === "hidden") return;
      requestRecovery("resumed");
      if (!events || events.readyState === EventSource.CLOSED) connect();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") ensureCurrent();
    };
    const healthTimer = window.setInterval(() => {
      if (!activeRef.current || document.visibilityState === "hidden") return;
      const transportTimeout = awaitingFirstEventRef.current ? 8000 : 25000;
      const activeSince = activeSinceRef.current;
      if (Date.now() - Math.max(lastTransportAt, activeSince) > transportTimeout) {
        connect();
        return;
      }
      const now = Date.now();
      if (now - Math.max(lastProgressAt, activeSince) > staleExecutionRecoveryMs
        && now - lastRecoveryAt > staleExecutionRecoveryMs) {
        requestRecovery("stale-execution");
      }
    }, 5000);

    connect();
    window.addEventListener("online", ensureCurrent);
    window.addEventListener("pageshow", ensureCurrent);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(eventTimer);
      pendingSessionIds.clear();
      pendingAllSessions = false;
      window.clearTimeout(recoveryTimer);
      window.clearInterval(healthTimer);
      clearReconnectTimers();
      window.removeEventListener("online", ensureCurrent);
      window.removeEventListener("pageshow", ensureCurrent);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      events?.close();
    };
  }, []);

  return connected;
}
