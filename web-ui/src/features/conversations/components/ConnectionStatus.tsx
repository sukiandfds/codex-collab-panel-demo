import { CircleHelp } from "lucide-react";
import styles from "./ConnectionStatus.module.css";

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className={styles.root}>
      <span className={`${styles.dot} ${connected ? styles.connected : ""}`} aria-hidden="true" />
      <span className={styles.name}>{connected ? "本地实时连接" : "正在连接本地服务"}</span>
      <span className={styles.info} aria-label="支持发送指令和附件" title="支持发送指令和附件"><CircleHelp aria-hidden="true" /></span>
    </div>
  );
}
