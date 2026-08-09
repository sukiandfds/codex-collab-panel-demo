import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Share2, X } from "lucide-react";
import { fetchJson, postJson } from "../../../shared/api/http";
import styles from "./AgentMessageShareControl.module.css";

interface AgentShareRoom { id: string; name: string; }
interface AgentShareTargets { conversationId: string; agent: { id: string; name: string }; rooms: AgentShareRoom[]; }
type ShareStatus = "success" | "error" | "";
const createRequestId = () => globalThis.crypto?.randomUUID?.() || `share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function AgentMessageShareControl({ className, threadId, messageId }: { className: string; threadId: string; messageId: string }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<AgentShareTargets | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [publishingRoomId, setPublishingRoomId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<ShareStatus>("");
  const retryRequestsRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !publishingRoomId) setOpen(false); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, publishingRoomId]);

  const openPicker = async () => {
    if (loadingTargets || publishingRoomId) return;
    setOpen(true); setTargets(null); setError(""); setStatus(""); setLoadingTargets(true);
    try {
      const conversationId = new URLSearchParams(window.location.search).get("conversation") || "";
      const targetQuery = conversationId ? `conversationId=${encodeURIComponent(conversationId)}` : `threadId=${encodeURIComponent(threadId)}`;
      setTargets(await fetchJson<AgentShareTargets>(`/api/agent-share/targets?${targetQuery}`));
    } catch { setError("发送失败"); }
    finally { setLoadingTargets(false); }
  };

  const closePicker = () => { if (!publishingRoomId) setOpen(false); };
  const publish = async (roomId: string) => {
    if (!targets || publishingRoomId || !roomId) return;
    const requestIds = retryRequestsRef.current;
    const requestId = requestIds.get(roomId) || createRequestId();
    requestIds.set(roomId, requestId); setPublishingRoomId(roomId);
    try {
      await postJson("/api/agent-share", { requestId, conversationId: targets.conversationId, messageId, roomId });
      requestIds.delete(roomId); setStatus("success"); setOpen(false);
    } catch { setStatus("error"); setOpen(false); }
    finally { setPublishingRoomId(""); }
  };

  return (
    <>
      <button className={className} type="button" aria-label={publishingRoomId ? "处理中" : "带到群聊"} title={publishingRoomId ? "处理中" : "带到群聊"} disabled={Boolean(publishingRoomId) || loadingTargets} aria-busy={Boolean(publishingRoomId)} onClick={() => void openPicker()}>
        {publishingRoomId ? <LoaderCircle className={styles.spinning} aria-hidden="true" /> : <Share2 aria-hidden="true" />}
      </button>
      {status ? <span className={styles.status} data-state={status} role="status">{status === "success" ? "已发送" : "发送失败"}</span> : null}
      {open ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="agent-share-title">
            <header className={styles.header}>
              <div><h2 id="agent-share-title">选择目标群聊</h2><p>{targets?.agent.name || "Agent"}</p></div>
              <button className={styles.closeButton} type="button" aria-label="关闭群聊选择" title="关闭" disabled={Boolean(publishingRoomId)} onClick={closePicker}><X aria-hidden="true" /></button>
            </header>
            <div className={styles.list}>
              {loadingTargets ? <p className={styles.message}>正在读取可发送群聊</p> : null}
              {!loadingTargets && error ? <p className={styles.error}>{error}</p> : null}
              {!loadingTargets && !error && targets?.rooms.length === 0 ? <p className={styles.message}>暂无可发送群聊</p> : null}
              {!loadingTargets && !error ? targets?.rooms.map((room) => (
                <button className={styles.roomButton} type="button" key={room.id} disabled={Boolean(publishingRoomId)} onClick={() => void publish(room.id)}>
                  <span>{room.name}</span>{publishingRoomId === room.id ? <LoaderCircle className={styles.spinning} aria-hidden="true" /> : null}
                </button>
              )) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
