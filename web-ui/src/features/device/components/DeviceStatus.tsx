import { Monitor } from "lucide-react";
import styles from "./DeviceStatus.module.css";

export function DeviceStatus({ name, connected }: { name?: string; connected: boolean }) {
  const deviceName = name || "原电脑服务";
  const state = connected ? "网页已同步" : "网页重连中";
  const detail = connected ? "网页与原电脑服务的实时连接正常" : "网页正在重新连接原电脑服务，不能据此判断电脑已离线";

  return (
    <span className={styles.root} title={`${deviceName} · ${detail}`} aria-label={`${deviceName}，${state}`}>
      <Monitor aria-hidden="true" />
      <span className={styles.name}>{deviceName}</span>
      <i className={connected ? styles.online : styles.offline} aria-hidden="true" />
      <span className={styles.state}>{state}</span>
    </span>
  );
}
