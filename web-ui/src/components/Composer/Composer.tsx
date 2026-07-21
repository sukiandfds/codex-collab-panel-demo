import { ArrowUp, LockKeyhole } from "lucide-react";
import styles from "./Composer.module.css";

export function Composer() {
  return (
    <div className={styles.positioner}>
      <div className={styles.composer} aria-label="只读模式">
        <label className={styles.srOnly} htmlFor="prompt">只读项目对话</label>
        <textarea id="prompt" rows={2} placeholder="当前为只读模式，暂不支持发送消息" disabled />
        <div className={styles.footer}>
          <span className={styles.readOnly}><LockKeyhole aria-hidden="true" />本地只读</span>
          <span className={styles.spacer} />
          <button className={styles.sendButton} type="button" aria-label="发送功能尚未开放" title="发送功能尚未开放" disabled>
            <ArrowUp aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
