import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ArtifactRealtimeEvent } from "../../artifacts/model/types";
import { groupApi } from "../data/groupApi";
import { upsertGroupMessage } from "../data/groupMessageState";
import type { GroupEvent, GroupSnapshot, GroupStreamingMessage } from "../model/types";

export function useGroupEvents(setSnapshot: Dispatch<SetStateAction<GroupSnapshot | null>>) {
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState<Record<string, GroupStreamingMessage>>({});
  const [artifactEvent, setArtifactEvent] = useState<ArtifactRealtimeEvent | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const streamingBuffer = useRef<Record<string, GroupStreamingMessage>>({});
  const streamingFrame = useRef(0);

  useEffect(() => {
    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current === null) return;
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    };

    const connect = () => {
      if (disposed) return;
      sourceRef.current?.close();
      const events = new EventSource(groupApi.eventsUrl(), { withCredentials: true });
      sourceRef.current = events;
      events.onopen = () => {
        clearReconnectTimer();
        setConnected(true);
      };
      events.onerror = () => {
        setConnected(false);
        if (reconnectTimerRef.current !== null) return;
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, 4000);
      };
      events.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as GroupEvent;
        if (event.type === "group_message_created") {
          setSnapshot((current) => current && {
            ...current,
            messages: upsertGroupMessage(current.messages, event.message),
          });
          const nextBuffer = { ...streamingBuffer.current };
          if (event.message.workId) {
            delete nextBuffer[event.message.workId];
          } else if (event.message.agentId) {
            Object.keys(nextBuffer).forEach((workId) => {
              if (nextBuffer[workId].agentId === event.message.agentId) delete nextBuffer[workId];
            });
          }
          streamingBuffer.current = nextBuffer;
          setStreaming(nextBuffer);
        } else if (event.type === "group_message_updated") {
          setSnapshot((current) => current && {
            ...current,
            messages: upsertGroupMessage(current.messages, event.message),
          });
        } else if (event.type === "group_agent_updated") {
          setSnapshot((current) => current && {
            ...current,
            agents: current.agents.map((agent) => agent.id === event.agent.id ? event.agent : agent),
          });
        } else if (event.type === "group_members_changed") {
          setSnapshot((current) => current && { ...current, members: event.members });
        } else if (event.type === "group_agent_started") {
          const pendingMessage = {
            id: `pending-${event.workId}`,
            workId: event.workId,
            pending: true,
            type: "agent" as const,
            authorId: event.agentId,
            authorName: event.agentName,
            agentId: event.agentId,
            mode: event.mode,
            text: "",
            attachments: [],
            artifactIds: [],
            createdAt: event.startedAt,
          };
          setSnapshot((current) => current && {
            ...current,
            messages: upsertGroupMessage(current.messages, pendingMessage),
          });
          const value: GroupStreamingMessage = {
            workId: event.workId,
            agentId: event.agentId,
            itemId: "",
            text: "",
            startedAt: event.startedAt,
          };
          streamingBuffer.current = { ...streamingBuffer.current, [event.workId]: value };
          setStreaming(streamingBuffer.current);
        } else if (event.type === "group_agent_delta") {
          const workId = event.workId || `${event.agentId}:${event.itemId}`;
          const previous = streamingBuffer.current[workId];
          const value: GroupStreamingMessage = {
            workId,
            agentId: event.agentId,
            itemId: event.itemId,
            text: previous?.itemId === event.itemId ? previous.text + event.delta : event.delta,
            startedAt: previous?.startedAt || new Date().toISOString(),
          };
          streamingBuffer.current = {
            ...streamingBuffer.current,
            [workId]: value,
          };
          setSnapshot((current) => {
            if (!current || current.messages.some((message) => message.workId === workId)) return current;
            return {
              ...current,
              messages: upsertGroupMessage(current.messages, {
                id: `pending-${workId}`,
                workId,
                pending: true,
                type: "agent",
                authorId: event.agentId,
                authorName: event.agentId,
                agentId: event.agentId,
                mode: "discussion",
                text: "",
                attachments: [],
                artifactIds: [],
                createdAt: value.startedAt,
              }),
            };
          });
          if (!streamingFrame.current) {
            streamingFrame.current = window.requestAnimationFrame(() => {
              streamingFrame.current = 0;
              setStreaming(streamingBuffer.current);
            });
          }
        } else if (event.type === "artifact.ready" || event.type === "artifact.reviewed") {
          setArtifactEvent(event);
        }
      } catch {
        // Ignore malformed realtime events and wait for the next snapshot/event.
      }
      };
    };

    const reconnectWhenAvailable = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      clearReconnectTimer();
      setConnected(false);
      connect();
    };

    connect();
    window.addEventListener("online", reconnectWhenAvailable);
    document.addEventListener("visibilitychange", reconnectWhenAvailable);
    return () => {
      disposed = true;
      clearReconnectTimer();
      window.removeEventListener("online", reconnectWhenAvailable);
      document.removeEventListener("visibilitychange", reconnectWhenAvailable);
      sourceRef.current?.close();
      sourceRef.current = null;
      if (streamingFrame.current) window.cancelAnimationFrame(streamingFrame.current);
    };
  }, [setSnapshot]);

  return { connected, streaming, artifactEvent };
}
