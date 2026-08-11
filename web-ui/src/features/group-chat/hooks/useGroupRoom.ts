import { useCallback, useEffect, useRef, useState } from "react";
import { createMemberId, readStoredMember, writeStoredMember } from "../data/groupMemberStorage";
import { groupApi } from "../data/groupApi";
import { removePendingMessage, upsertGroupMessage } from "../data/groupMessageState";
import { readGroupSnapshot, reconcileGroupSnapshot, writeGroupSnapshot } from "../data/groupSnapshot";
import type { GroupMessage, GroupMode, GroupRoom, GroupSnapshot, StoredMember } from "../model/types";
import { useGroupEvents } from "../realtime/useGroupEvents";

export function useGroupRoom() {
  const [initialSnapshot] = useState(() => readGroupSnapshot("current-project"));
  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(initialSnapshot);
  const [rooms, setRooms] = useState<GroupRoom[]>([]);
  const [roomId, setRoomId] = useState(initialSnapshot?.room.id || "current-project");
  const [member, setMember] = useState<StoredMember | null>(readStoredMember);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [initialSyncReady, setInitialSyncReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const sendingRef = useRef(false);
  const activeRoomIdRef = useRef(roomId);
  const sendGenerationRef = useRef(0);
  const pendingMessagesRef = useRef(new Map<string, GroupMessage>());
  activeRoomIdRef.current = roomId;
  const realtime = useGroupEvents(setSnapshot, roomId);

  useEffect(() => {
    const controller = new AbortController();
    void groupApi.rooms(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setRooms(Array.isArray(response.rooms) ? response.rooms : []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await groupApi.snapshot(roomId, signal);
      setSnapshot((current) => reconcileGroupSnapshot(
        next,
        current,
        [...pendingMessagesRef.current.values()],
      ));
      setError("");
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).finally(() => {
      if (!controller.signal.aborted) setInitialSyncReady(true);
    });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!snapshot) return;
    const timer = window.setTimeout(() => writeGroupSnapshot(snapshot), 250);
    return () => window.clearTimeout(timer);
  }, [snapshot]);

  const selectRoom = useCallback((nextRoomId: string) => {
    const next = String(nextRoomId || "").trim();
    if (!next || next === roomId) return;
    const cached = readGroupSnapshot(next);
    sendGenerationRef.current += 1;
    sendingRef.current = false;
    pendingMessagesRef.current.clear();
    setRoomId(next);
    setSnapshot(cached);
    setLoading(!cached);
    setSending(false);
    setInitialSyncReady(false);
    setError("");
  }, [roomId]);

  useEffect(() => {
    if (!member) return;
    const controller = new AbortController();
    const ping = () => groupApi.presence(member, roomId, controller.signal).catch(() => {});
    void ping();
    const timer = window.setInterval(ping, 20000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [member, roomId]);

  const join = useCallback(async (name: string) => {
    const joined = await groupApi.join({ id: member?.id || createMemberId(), name: name.trim() }, roomId);
    setMember(joined);
    writeStoredMember(joined);
    return joined;
  }, [member?.id, roomId]);

  const send = useCallback(async (mode: GroupMode, agentIds: string[], text: string, attachmentIds: string[] = []) => {
    if (!member || sendingRef.current || (!text.trim() && !attachmentIds.length)) return false;
    sendingRef.current = true;
    setSending(true);
    setError("");
    const clientMessageId = globalThis.crypto?.randomUUID?.()
      || `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const requestRoomId = roomId;
    const sendGeneration = ++sendGenerationRef.current;
    const optimisticMessage: GroupMessage = {
      id: `optimistic-${clientMessageId}`,
      clientMessageId,
      pending: true,
      type: "human",
      authorId: member.id,
      authorName: member.name,
      agentId: agentIds[0] || "manager",
      targetAgentIds: agentIds.length ? agentIds : ["manager"],
      mode,
      text: text.trim(),
      attachments: [],
      artifactIds: [],
      createdAt: new Date().toISOString(),
    };
    pendingMessagesRef.current.set(clientMessageId, optimisticMessage);
    setSnapshot((current) => current && {
      ...current,
      messages: upsertGroupMessage(current.messages, optimisticMessage),
    });
    void (async () => {
      try {
        const result = await groupApi.send(member, requestRoomId, mode, agentIds, text.trim(), clientMessageId, attachmentIds);
        if (sendGeneration !== sendGenerationRef.current || activeRoomIdRef.current !== requestRoomId) return;
        pendingMessagesRef.current.delete(clientMessageId);
        const confirmedMessage = {
          ...result.message,
          clientMessageId: result.message.clientMessageId || clientMessageId,
        };
        setSnapshot((current) => current && {
          ...current,
          messages: upsertGroupMessage(current.messages, confirmedMessage),
        });
      } catch (reason) {
        if (sendGeneration !== sendGenerationRef.current || activeRoomIdRef.current !== requestRoomId) return;
        pendingMessagesRef.current.delete(clientMessageId);
        setSnapshot((current) => current && {
          ...current,
          messages: removePendingMessage(current.messages, clientMessageId),
        });
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (sendGeneration === sendGenerationRef.current) {
          sendingRef.current = false;
          setSending(false);
        }
      }
    })();
    return true;
  }, [member, roomId]);

  return {
    snapshot, rooms, roomId, selectRoom, member, loading, initialSyncReady, sending, error, join, send, refresh,
    connected: realtime.connected,
    streaming: realtime.streaming,
    artifactEvent: realtime.artifactEvent,
  };
}
