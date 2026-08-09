import { useState } from "react";
import { LoaderCircle, MessageCircle } from "lucide-react";
import { postJson } from "../../../shared/api/http";
import styles from "./AgentMessageLauncher.module.css";

interface OpenAgentConversationResponse {
  conversationId: string;
  runtimeKind: string;
  threadId: string | null;
}

export function AgentMessageLauncher({ agentId, onOpened }: { agentId: string; onOpened?: () => void }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const openConversation = async () => {
    if (!agentId || opening) return;
    setOpening(true);
    setError("");
    try {
      const result = await postJson<OpenAgentConversationResponse>("/api/agent-conversations/open", { agentId });
      if (!result.threadId) throw new Error("当前 Runtime 暂不支持此单聊页面");
      const params = new URLSearchParams(window.location.search);
      params.delete("view");
      params.delete("archived");
      params.delete("employee");
      params.set("thread", result.threadId);
      params.set("agent", agentId);
      if (result.conversationId) params.set("conversation", result.conversationId);
      const query = params.toString();
      window.history.pushState({ surface: "conversation", agentId, threadId: result.threadId }, "", `/${query ? `?${query}` : ""}`);
      window.dispatchEvent(new Event("negus:navigate"));
      setOpening(false);
      onOpened?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法进入单聊");
      setOpening(false);
    }
  };

  return (
    <section className={styles.section} aria-label="Agent 单聊">
      <button className={styles.button} type="button" disabled={opening} onClick={() => void openConversation()}>
        {opening ? <LoaderCircle className={styles.spinning} aria-hidden="true" /> : <MessageCircle aria-hidden="true" />}
        <span>{opening ? "正在进入" : "发消息"}</span>
      </button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
