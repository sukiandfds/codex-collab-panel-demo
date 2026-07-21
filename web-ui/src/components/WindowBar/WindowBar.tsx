import { ArrowLeft, ArrowRight, Copy, Minus, PanelLeft, X } from "lucide-react";
import styles from "./WindowBar.module.css";

export function WindowBar() {
  return (
    <header className={styles.windowBar} aria-label="应用菜单栏">
      <div className={styles.navigation}>
        <button className={styles.iconButton} type="button" aria-label="切换侧栏" title="切换侧栏">
          <PanelLeft aria-hidden="true" />
        </button>
        <button className={styles.iconButton} type="button" aria-label="后退" title="后退">
          <ArrowLeft aria-hidden="true" />
        </button>
        <button className={`${styles.iconButton} ${styles.disabled}`} type="button" aria-label="前进" title="前进" disabled>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
      <nav className={styles.menu} aria-label="应用菜单">
        <button type="button">文件</button>
        <button type="button">编辑</button>
        <button type="button">视图</button>
        <button type="button">帮助</button>
      </nav>
      <div className={styles.dragRegion} />
      <div className={styles.windowControls} aria-label="窗口控制">
        <button type="button" aria-label="最小化" title="最小化"><Minus aria-hidden="true" /></button>
        <button type="button" aria-label="还原" title="还原"><Copy aria-hidden="true" /></button>
        <button className={styles.close} type="button" aria-label="关闭" title="关闭"><X aria-hidden="true" /></button>
      </div>
    </header>
  );
}
