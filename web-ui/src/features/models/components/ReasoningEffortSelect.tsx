import type { CodexModel } from "../model/types";
import { formatReasoningEffort, reasoningEffortDescription } from "../model/reasoningEffortLabels";
import styles from "./ModelSelect.module.css";

interface ReasoningEffortSelectProps {
  currentModel: CodexModel | undefined;
  currentEffort: string;
  disabled: boolean;
  loading: boolean;
  changing: boolean;
  error: string;
  onChange: (reasoningEffort: string) => Promise<boolean>;
}

export function ReasoningEffortSelect({
  currentModel, currentEffort, disabled, loading, changing, error, onChange,
}: ReasoningEffortSelectProps) {
  const options = currentModel?.supportedReasoningEfforts || [];
  const selected = options.some((entry) => entry.reasoningEffort === currentEffort) ? currentEffort : "";

  return (
    <select
      className={styles.select}
      aria-label="调整推理强度"
      title={error || `推理强度：${formatReasoningEffort(selected) || "未读取"}`}
      value={selected}
      disabled={disabled || loading || changing || !options.length}
      onChange={(event) => void onChange(event.target.value)}
    >
      {!selected ? <option value="">推理强度</option> : null}
      {options.map((entry) => {
        const description = reasoningEffortDescription(entry.reasoningEffort);
        return (
          <option key={entry.reasoningEffort} value={entry.reasoningEffort}>
            {formatReasoningEffort(entry.reasoningEffort)}{description ? ` · ${description}` : ""}
          </option>
        );
      })}
    </select>
  );
}
