import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ArtifactRealtimeEvent } from "../../artifacts/model/types";
import { groupApi } from "../data/groupApi";
import { upsertGroupMessage } from "../data/groupMessageState";
import type { GroupEvent, GroupSnapshot } from "../model/types";

export function useGroupEvents(setSnapshot: Dispatch<SetStateAction<GroupSnapshot | null>>) {
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState<Record<string, { itemId: string; text: string }>>({});
  const [artifactEvent, setArtifactEvent] = useState<ArtifactRealtimeEvent | null>(null);
  const streamingBuffer = useRef<Record<string, { itemId: string; text: string }>>({});
  const streamingFrame = useRef(0);

  useEffect(() => {
    const events = new EventSource(groupApi.eventsUrl());
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as GroupEvent;
        if (event.type === "group_message_created") {
          setSnapshot((current) => current && {
            ...current,
            messages: upsertGroupMessage(current.messages, event.message),
          });
          if (event.message.agentId) {
            const nextBuffer = { ...streamingBuffer.current };
            delete nextBuffer[event.message.agentId];
            streamingBuffer.current = nextBuffer;
            setStreaming((current) => {
              const next = { ...current };
              delete next[event.message.agentId!];
              return next;
            });
          }
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
        } else if (event.type === "group_agent_delta") {
          const previous = streamingBuffer.current[event.agentId];
          streamingBuffer.current = {
            ...streamingBuffer.current,
            [event.agentId]: {
              itemId: event.itemId,
              text: previous?.itemId === event.itemId ? previous.text + event.delta : event.delta,
            },
          };
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
    return () => {
      events.close();
      if (streamingFrame.current) window.cancelAnimationFrame(streamingFrame.current);
    };
  }, [setSnapshot]);

  return { connected, streaming, artifactEvent };
}
