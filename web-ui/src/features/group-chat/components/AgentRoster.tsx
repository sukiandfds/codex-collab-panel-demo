import { Bot, CircleDot } from "lucide-react";
import type { GroupAgent } from "../model/types";
import styles from "./AgentRoster.module.css";

export function AgentRoster({ agents, selectedId, onSelect }: {
  agents: GroupAgent[];
  selectedId: string;
  onSelect: (agentId: string) => void;
}) {
  return (
    <aside className={styles.agentPanel}>
      <div className={styles.panelHeading}><Bot />AI 员工</div>
      <div className={styles.agentList}>
        {agents.map((agent) => (
          <button className={`${styles.agentRow} ${selectedId === agent.id ? styles.selectedAgent : ""}`} type="button" key={agent.id} onClick={() => onSelect(agent.id)}>
            <span className={styles.agentAvatar}>{agent.shortName}</span>
            <span className={styles.agentText}><strong>{agent.name}</strong><small>{agent.active ? agent.label : agent.responsibility}</small></span>
            <CircleDot className={agent.active ? styles.agentActive : styles.agentIdle} />
          </button>
        ))}
      </div>
    </aside>
  );
}
