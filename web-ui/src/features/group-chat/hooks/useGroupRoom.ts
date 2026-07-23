import { useCallback, useEffect, useState } from "react";
import { groupApi } from "../data/groupApi";
import type { GroupEvent, GroupMode, GroupSnapshot, StoredMember } from "../model/types";

const memberKey = "codex-collab-group-member";

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
            setStreaming((current) => {
              const next = { ...current };
              delete next[event.message.agentId!];
              return next;
            });
          }
        } else if (event.type === "group_agent_updated") {
          setSnapshot((current) => current && {
            ...current,
            agents: current.agents.map((agent) => agent.id === event.agent.id ? event.agent : agent),
          });
        } else if (event.type === "group_members_changed") {
          setSnapshot((current) => current && { ...current, members: event.members });
        } else if (event.type === "group_agent_delta") {
          setStreaming((current) => {
            const previous = current[event.agentId];
            return {
              ...current,
              [event.agentId]: {
                itemId: event.itemId,
                text: previous?.itemId === event.itemId ? previous.text + event.delta : event.delta,
              },
            };
          });
        }
      } catch {}
    };
    return () => events.close();
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
    const next = { id: member?.id || crypto.randomUUID(), name: name.trim() };
    const joined = await groupApi.join(next);
    localStorage.setItem(memberKey, JSON.stringify(joined));
    setMember(joined);
    return joined;
  }, [member?.id]);

  const send = useCallback(async (mode: GroupMode, agentId: string, text: string) => {
    if (!member || sending || !text.trim()) return false;
    setSending(true);
    setError("");
    try {
      await groupApi.send(member, mode, agentId, text.trim());
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setSending(false);
    }
  }, [member, sending]);

  return { snapshot, member, connected, loading, sending, error, streaming, join, send, refresh };
}
