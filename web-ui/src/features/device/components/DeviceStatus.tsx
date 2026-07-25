import { Monitor } from "lucide-react";
import styles from "./DeviceStatus.module.css";

export function DeviceStatus({ name, connected }: { name?: string; connected: boolean }) {
  const deviceName = name || "当前电脑";
  const state = connected ? "在线" : "正在重连";

  return (
    <span className={styles.root} title={`${deviceName} · ${state}`} aria-label={`${deviceName}，${state}`}>
      <Monitor aria-hidden="true" />
      <span className={styles.name}>{deviceName}</span>
      <i className={connected ? styles.online : styles.offline} aria-hidden="true" />
      <span className={styles.state}>{state}</span>
    </span>
  );
}
