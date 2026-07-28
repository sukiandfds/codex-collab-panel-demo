import { useEffect, useRef, useState } from "react";
import { hasAccessToken, withAccessToken } from "../data/http";
import type { ProjectEvent } from "../../execution/model/types";

export function useConversationEvents(
  onSessionsChanged: (threadId?: string) => void,
  onEvent: (event: ProjectEvent) => void,
  onRecover: () => void,
  active: boolean,
  awaitingFirstEvent: boolean,
) {
  const [connected, setConnected] = useState(true);
  const onSessionsChangedRef = useRef(onSessionsChanged);
  const onEventRef = useRef(onEvent);
  const onRecoverRef = useRef(onRecover);
  const activeRef = useRef(active);
  const activeSinceRef = useRef(active ? Date.now() : 0);
  const awaitingFirstEventRef = useRef(awaitingFirstEvent);

  useEffect(() => { onSessionsChangedRef.current = onSessionsChanged; }, [onSessionsChanged]);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onRecoverRef.current = onRecover; }, [onRecover]);
  useEffect(() => {
    activeRef.current = active;
    if (active) activeSinceRef.current = Date.now();
    if (!active) setConnected(true);
  }, [active]);
  useEffect(() => { awaitingFirstEventRef.current = awaitingFirstEvent; }, [awaitingFirstEvent]);

  useEffect(() => {
    if (!hasAccessToken) return;
    let eventTimer = 0;
    let reconnectTimer = 0;
    let disconnectedTimer = 0;
    let events: EventSource | null = null;
    let openedOnce = false;
    let reconnectAttempt = 0;
    let lastEventAt = Date.now();

    const clearReconnectTimers = () => {
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(disconnectedTimer);
    };
    const recover = () => {
      lastEventAt = Date.now();
      onRecoverRef.current();
    };
    const connect = () => {
      clearReconnectTimers();
      events?.close();
      events = new EventSource(withAccessToken("/events"));
      if (activeRef.current) {
        disconnectedTimer = window.setTimeout(() => setConnected(false), 5000);
      }
      events.onopen = () => {
        const recovering = openedOnce;
        openedOnce = true;
        reconnectAttempt = 0;
        lastEventAt = Date.now();
        window.clearTimeout(disconnectedTimer);
        setConnected(true);
        if (recovering) recover();
      };
      events.onerror = () => {
        events?.close();
        events = null;
        if (activeRef.current) {
          disconnectedTimer = window.setTimeout(() => setConnected(false), 5000);
        }
        const delays = [1000, 2000, 5000, 10000];
        const delay = delays[Math.min(reconnectAttempt, delays.length - 1)];
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
      events.onmessage = (event) => {
        lastEventAt = Date.now();
        window.clearTimeout(disconnectedTimer);
        setConnected(true);
        try {
          const payload = JSON.parse(event.data) as ProjectEvent;
          if (payload.type === "connected" || payload.type === "heartbeat") return;
          onEventRef.current(payload);
          if (payload.type === "sessions_changed") {
            window.clearTimeout(eventTimer);
            eventTimer = window.setTimeout(() => onSessionsChangedRef.current(payload.threadId), 180);
          }
        } catch {}
      };
    };

    const ensureCurrent = () => {
      if (document.visibilityState === "hidden") return;
      recover();
      if (!events || events.readyState === EventSource.CLOSED) connect();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") ensureCurrent();
    };
    const healthTimer = window.setInterval(() => {
      if (!activeRef.current || document.visibilityState === "hidden") return;
      const timeout = awaitingFirstEventRef.current ? 8000 : 25000;
      const latestActivity = Math.max(lastEventAt, activeSinceRef.current);
      if (Date.now() - latestActivity > timeout) {
        recover();
        connect();
      }
    }, 5000);

    connect();
    window.addEventListener("online", ensureCurrent);
    window.addEventListener("pageshow", ensureCurrent);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(eventTimer);
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
