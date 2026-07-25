import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import styles from "../GroupChat.module.css";

export function MemberDialog({ initialName, open, onSubmit }: {
  initialName: string;
  open: boolean;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setName(initialName);
    setError("");
  }, [initialName, open]);
  if (!open) return null;
  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit(name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "进入项目群失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="member-title">
        <span className={styles.dialogIcon}><Users /></span>
        <h2 id="member-title">进入项目群</h2>
        <p>设置您在这个浏览器中的成员名称。</p>
        <input
          value={name}
          maxLength={24}
          autoFocus
          placeholder="成员名称"
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {error ? <div className={styles.dialogError} role="alert">{error}</div> : null}
        <button type="button" disabled={!name.trim() || saving} onClick={() => void submit()}>{saving ? "正在进入" : "进入项目群"}</button>
      </div>
    </div>
  );
}
