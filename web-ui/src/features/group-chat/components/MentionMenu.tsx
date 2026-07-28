import { Bot, UserRound } from "lucide-react";
import styles from "./MentionMenu.module.css";

export interface MentionOption {
  id: string;
  name: string;
  detail: string;
  kind: "agent" | "member";
  agentId?: string;
}

export function MentionMenu({ options, activeIndex, onActiveChange, onSelect }: {
  options: MentionOption[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onSelect: (option: MentionOption) => void;
}) {
  if (!options.length) return null;
  return (
    <div className={styles.mentionMenu} role="listbox" aria-label="选择要提及的人或 Agent">
      <div className={styles.mentionHeading}>提及</div>
      {options.map((option, index) => (
        <button
          className={`${styles.mentionOption} ${index === activeIndex ? styles.activeMention : ""}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          key={option.id}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onActiveChange(index)}
          onClick={() => onSelect(option)}
        >
          <span className={styles.mentionAvatar}>{option.kind === "agent" ? <Bot /> : <UserRound />}</span>
          <span className={styles.mentionText}><strong>{option.name}</strong><small>{option.detail}</small></span>
          <em>{option.kind === "agent" ? "Agent" : "成员"}</em>
        </button>
      ))}
    </div>
  );
}
