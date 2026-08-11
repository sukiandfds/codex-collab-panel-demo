import { useState } from "react";
import { LoaderCircle, MessageCircle } from "lucide-react";
import { openAgentConversation } from "../navigation/openAgentConversation";
import styles from "./AgentMessageLauncher.module.css";

export function AgentMessageLauncher({ agentId, onOpened }: { agentId: string; onOpened?: () => void }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const openConversation = async () => {
    if (!agentId || opening) return;
    setOpening(true);
    setError("");
    try {
      await openAgentConversation({ agentId });
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
