import type { CodexModel } from "../model/types";
import { formatModelDisplayName } from "../model/modelDisplayName";
import styles from "./ModelSelect.module.css";

interface ModelSelectProps {
  currentModel: string;
  models: CodexModel[];
  disabled: boolean;
  loading: boolean;
  changing: boolean;
  error: string;
  onChange: (model: string) => Promise<boolean>;
}

export function ModelSelect({
  currentModel, models, disabled, loading, changing, error, onChange,
}: ModelSelectProps) {
  const options = currentModel && !models.some((entry) => entry.model === currentModel)
    ? [{ id: currentModel, model: currentModel, displayName: currentModel, description: "", isDefault: false, supportedReasoningEfforts: [] }, ...models]
    : models;

  return (
    <select
      className={styles.select}
      aria-label="切换模型"
      title={error || "当前模型"}
      value={currentModel}
      disabled={disabled || loading || changing || !options.length}
      onChange={(event) => void onChange(event.target.value)}
    >
      {!currentModel ? <option value="">{loading ? "读取模型" : "选择模型"}</option> : null}
      {options.map((entry) => (
        <option key={entry.id} value={entry.model}>{formatModelDisplayName(entry.model, entry.displayName)}</option>
      ))}
    </select>
  );
}
