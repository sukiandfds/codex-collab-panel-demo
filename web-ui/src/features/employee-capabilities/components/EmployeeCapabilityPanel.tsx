import { Bot, Check, LoaderCircle } from "lucide-react";
import { ProjectStatusBadge } from "../../project-directory/components/ProjectStatusBadge";
import { useEmployeeCapability } from "../hooks/useEmployeeCapability";
import styles from "./EmployeeCapabilityPanel.module.css";

export function EmployeeCapabilityPanel({ employeeId }: { employeeId: string }) {
  const capability = useEmployeeCapability(employeeId);
  if (!employeeId) return null;

  const employee = capability.snapshot?.employee;
  const status = capability.snapshot?.status;
  const confirmed = capability.snapshot?.modificationConfirmed === true;
  const canConfirm = Boolean(employee) && !capability.error;
  const hasMainConversation = Boolean(
    capability.snapshot?.threadId
    || capability.snapshot?.conversationId
    || employee?.mainThreadId
    || employee?.conversationId,
  );

  return (
    <section className={styles.panel} aria-label="员工项目能力">
      <header className={styles.header}>
        <Bot aria-hidden="true" />
        <div className={styles.identity}>
          <strong>{employee?.name || "员工项目"}</strong>
          {employee?.responsibility ? <span>{employee.responsibility}</span> : null}
        </div>
        {capability.loading ? <LoaderCircle className={styles.spinner} aria-label="正在读取员工状态" /> : <ProjectStatusBadge status={status} />}
      </header>

      {employee || capability.snapshot ? (
        <dl className={styles.meta}>
          <div><dt>项目</dt><dd>{employee?.projectKey || "已绑定"}</dd></div>
          <div><dt>Runtime</dt><dd>{employee?.runtimeKind || "Codex"}</dd></div>
          <div><dt>主对话</dt><dd>{hasMainConversation ? "已绑定" : "尚未建立"}</dd></div>
          <div><dt>状态</dt><dd>{status?.label || (confirmed ? "等待任务" : "等待确认")}</dd></div>
        </dl>
      ) : null}

      <div className={styles.permission}>
        <div className={styles.permissionHeading}>
          <span>修改权限</span>
          <strong data-confirmed={confirmed ? "true" : "false"}>{confirmed ? "可执行" : "只读"}</strong>
        </div>
        {!confirmed ? (
          <button
            type="button"
            disabled={!canConfirm || capability.loading || capability.confirming || Boolean(status?.active)}
            onClick={() => void capability.confirmModification()}
          >
            {capability.confirming || status?.active ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Check aria-hidden="true" />}
            {capability.confirming ? "确认中" : status?.active ? "处理中" : "确认执行修改"}
          </button>
        ) : null}
      </div>
      {capability.error ? <p className={styles.error}>{capability.error}</p> : null}
    </section>
  );
}
