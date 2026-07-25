import { ChevronDown } from "lucide-react";
import styles from "./JumpToLatest.module.css";

export function JumpToLatest({ visible, className = "", onClick }: {
  visible: boolean;
  className?: string;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <button className={`${styles.button} ${className}`} type="button" onClick={onClick}>
      <ChevronDown aria-hidden="true" />
      <span>新消息</span>
    </button>
  );
}
