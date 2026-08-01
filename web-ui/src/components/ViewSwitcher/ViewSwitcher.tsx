import { Bot, ListChecks, MessagesSquare } from "lucide-react";
import styles from "./ViewSwitcher.module.css";

export function ViewSwitcher({ current }: { current: "conversation" | "group" | "progress" }) {
  const query = window.location.search;
  return (
    <nav className={styles.root} aria-label="切换对话模式">
      <a className={current === "conversation" ? styles.active : ""} href={`/${query}`} title="单人 Codex 对话" aria-label="单人 Codex 对话">
        <Bot aria-hidden="true" /><span>对话</span>
      </a>
      <a className={current === "group" ? styles.active : ""} href={`/group.html${query}`} title="项目群聊" aria-label="项目群聊">
        <MessagesSquare aria-hidden="true" /><span>群聊</span>
      </a>
      <a className={current === "progress" ? styles.active : ""} href={`/progress.html${query}`} title="项目进度" aria-label="项目进度">
        <ListChecks aria-hidden="true" /><span>进度</span>
      </a>
    </nav>
  );
}
