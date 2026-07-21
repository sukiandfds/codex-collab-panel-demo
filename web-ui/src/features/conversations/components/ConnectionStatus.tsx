import { CircleHelp } from "lucide-react";
import styles from "./ConnectionStatus.module.css";

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className={styles.root}>
      <span className={`${styles.dot} ${connected ? styles.connected : ""}`} aria-hidden="true" />
      <span className={styles.name}>{connected ? "本地实时连接" : "正在连接本地服务"}</span>
      <button type="button" aria-label="只读模式" title="当前页面为只读模式"><CircleHelp aria-hidden="true" /></button>
    </div>
  );
}
