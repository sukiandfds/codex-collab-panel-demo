import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CodexModel } from "../model/types";
import { ModelSelect } from "./ModelSelect";
import { ReasoningEffortSelect } from "./ReasoningEffortSelect";
import styles from "./ModelSelect.module.css";

const effortLabels: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "超高",
  max: "极高",
  ultra: "最高",
};

interface ModelSettingsControlProps {
  currentModel: string;
  currentEffort: string;
  models: CodexModel[];
  disabled: boolean;
  loading: boolean;
  changing: boolean;
  error: string;
  onModelChange: (model: string) => Promise<boolean>;
  onReasoningEffortChange: (reasoningEffort: string) => Promise<boolean>;
}

export function ModelSettingsControl({
  currentModel, currentEffort, models, disabled, loading, changing, error,
  onModelChange, onReasoningEffortChange,
}: ModelSettingsControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = models.find((entry) => entry.model === currentModel);
  const modelLabel = current?.displayName || currentModel || (loading ? "读取模型" : "选择模型");
  const effortLabel = effortLabels[currentEffort] || currentEffort;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={styles.settings} ref={rootRef}>
      <button
        className={styles.trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="模型与思考程度"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{modelLabel}{effortLabel ? ` · ${effortLabel}` : ""}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.settingsMenu} role="dialog" aria-label="模型设置">
          <label className={styles.settingRow}>
            <span>模型</span>
            <ModelSelect
              currentModel={currentModel}
              models={models}
              loading={loading}
              changing={changing}
              error={error}
              disabled={disabled}
              onChange={onModelChange}
            />
          </label>
          <label className={styles.settingRow}>
            <span>思考程度</span>
            <ReasoningEffortSelect
              currentModel={current}
              currentEffort={currentEffort}
              loading={loading}
              changing={changing}
              error={error}
              disabled={disabled}
              onChange={onReasoningEffortChange}
            />
          </label>
          {disabled ? <small className={styles.menuHint}>任务运行时暂时不能修改</small> : null}
        </div>
      ) : null}
    </div>
  );
}
