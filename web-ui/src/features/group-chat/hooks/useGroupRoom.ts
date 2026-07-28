import { useCallback, useEffect, useRef, useState } from "react";
import { groupApi } from "../data/groupApi";
import type { GroupEvent, GroupMode, GroupSnapshot, StoredMember } from "../model/types";
import type { ArtifactRealtimeEvent } from "../../artifacts/model/types";

const memberKey = "codex-collab-group-member";

const createMemberId = () => globalThis.crypto?.randomUUID?.()
  || `member-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const readMember = (): StoredMember | null => {
  try {
    const value = JSON.parse(localStorage.getItem(memberKey) || "null") as StoredMember | null;
    return value?.id && value?.name ? value : null;
  } catch {
    return null;
  }
};

export function useGroupRoom() {
  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(null);
  const [member, setMember] = useState<StoredMember | null>(readMember);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [streaming, setStreaming] = useState<Record<string, { itemId: string; text: string }>>({});
  const [artifactEvent, setArtifactEvent] = useState<ArtifactRealtimeEvent | null>(null);
  const streamingBuffer = useRef<Record<string, { itemId: string; text: string }>>({});
  const streamingFrame = useRef(0);
  const sendingRef = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await groupApi.snapshot(signal);
      setSnapshot(next);
      setError("");
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const events = new EventSource(groupApi.eventsUrl());
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as GroupEvent;
        if (event.type === "group_message_created") {
          setSnapshot((current) => current && current.messages.some((item) => item.id === event.message.id)
            ? current
            : current && { ...current, messages: [...current.messages, event.message] });
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
            messages: current.messages.map((item) => item.id === event.message.id ? event.message : item),
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
        } else if (event.type === "artifact.ready" || event.type === "artifact.reviewed") setArtifactEvent(event);
      } catch {}
    };
    return () => {
      events.close();
      if (streamingFrame.current) window.cancelAnimationFrame(streamingFrame.current);
    };
  }, []);

  useEffect(() => {
    if (!member) return;
    const controller = new AbortController();
    const ping = () => groupApi.presence(member, controller.signal).catch(() => {});
    void ping();
    const timer = window.setInterval(ping, 20000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [member]);

  const join = useCallback(async (name: string) => {
    const next = { id: member?.id || createMemberId(), name: name.trim() };
    const joined = await groupApi.join(next);
    setMember(joined);
    try {
      localStorage.setItem(memberKey, JSON.stringify(joined));
    } catch {
      // Storage may be unavailable in private or restricted mobile browsers.
    }
    return joined;
  }, [member?.id]);

  const send = useCallback(async (mode: GroupMode, agentIds: string[], text: string, attachmentIds: string[] = []) => {
    if (!member || sendingRef.current || (!text.trim() && !attachmentIds.length)) return false;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      await groupApi.send(member, mode, agentIds, text.trim(), attachmentIds);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [member]);

  return { snapshot, member, connected, loading, sending, error, streaming, artifactEvent, join, send, refresh };
}
