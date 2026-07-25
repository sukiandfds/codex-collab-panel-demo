import { ArrowLeft, ArrowRight, Copy, Minus, PanelLeft, X } from "lucide-react";
import styles from "./WindowBar.module.css";

export function WindowBar() {
  return (
    <header className={styles.windowBar} aria-label="应用菜单栏">
      <div className={styles.navigation} aria-hidden="true">
        <span className={styles.iconButton}>
          <PanelLeft aria-hidden="true" />
        </span>
        <span className={styles.iconButton}>
          <ArrowLeft aria-hidden="true" />
        </span>
        <span className={`${styles.iconButton} ${styles.disabled}`}>
          <ArrowRight aria-hidden="true" />
        </span>
      </div>
      <div className={styles.menu} aria-hidden="true">
        <span>文件</span>
        <span>编辑</span>
        <span>视图</span>
        <span>帮助</span>
      </div>
      <div className={styles.dragRegion} />
      <div className={styles.windowControls} aria-hidden="true">
        <span><Minus aria-hidden="true" /></span>
        <span><Copy aria-hidden="true" /></span>
        <span><X aria-hidden="true" /></span>
      </div>
    </header>
  );
}
