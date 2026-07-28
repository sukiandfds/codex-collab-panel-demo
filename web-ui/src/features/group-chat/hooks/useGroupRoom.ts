import { useCallback, useEffect, useRef, useState } from "react";
import { createMemberId, readStoredMember, writeStoredMember } from "../data/groupMemberStorage";
import { groupApi } from "../data/groupApi";
import type { GroupMode, GroupSnapshot, StoredMember } from "../model/types";
import { useGroupEvents } from "../realtime/useGroupEvents";

export function useGroupRoom() {
  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(null);
  const [member, setMember] = useState<StoredMember | null>(readStoredMember);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const sendingRef = useRef(false);
  const realtime = useGroupEvents(setSnapshot);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      setSnapshot(await groupApi.snapshot(signal));
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
    const joined = await groupApi.join({ id: member?.id || createMemberId(), name: name.trim() });
    setMember(joined);
    writeStoredMember(joined);
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

  return {
    snapshot, member, loading, sending, error, join, send, refresh,
    connected: realtime.connected,
    streaming: realtime.streaming,
    artifactEvent: realtime.artifactEvent,
  };
}
