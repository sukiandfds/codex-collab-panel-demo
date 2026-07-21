import { useEffect, useState } from "react";
import { hasAccessToken, withAccessToken } from "../data/http";

export function useConversationEvents(onSessionsChanged: (threadId?: string) => void) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!hasAccessToken) return;
    let timer = 0;
    const events = new EventSource(withAccessToken("/events"));
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; threadId?: string };
        if (payload.type !== "sessions_changed") return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => onSessionsChanged(payload.threadId), 180);
      } catch {}
    };
    return () => {
      window.clearTimeout(timer);
      events.close();
    };
  }, [onSessionsChanged]);

  return connected;
}
