import { Check, LoaderCircle, X } from "lucide-react";
import { useEmployeeGrowth } from "../hooks/useEmployeeGrowth";
import type { GrowthProposal } from "../model/types";
import styles from "./EmployeeGrowthPanel.module.css";

const categoryLabels: Record<string, string> = { fact: "事实记忆", rule: "规则建议", skill: "Skill 建议" };
const statusLabels: Record<string, string> = { ready: "待审批", pending: "处理中", approved: "已批准", rejected: "已拒绝", failed: "保存失败" };

function Proposal({ proposal, busy, onApprove, onReject }: { proposal: GrowthProposal; busy: boolean; onApprove: () => void; onReject: () => void }) {
  const actionable = proposal.status === "ready" || proposal.status === "failed";
  return (
    <article className={styles.proposal} data-status={proposal.status}>
      <div className={styles.proposalHeader}><strong>{categoryLabels[proposal.category] || proposal.category}</strong><span>{statusLabels[proposal.status] || proposal.status}</span></div>
      {proposal.title ? <h4>{proposal.title}</h4> : null}
      <p>{proposal.content}</p>
      {proposal.error ? <small>{proposal.error}</small> : null}
      {actionable ? (
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={onApprove}><Check aria-hidden="true" />批准</button>
          <button type="button" disabled={busy} onClick={onReject}><X aria-hidden="true" />拒绝</button>
        </div>
      ) : null}
      {busy ? <LoaderCircle className={styles.spinner} aria-label="处理中" /> : null}
    </article>
  );
}

export function EmployeeGrowthPanel() {
  const employeeId = new URLSearchParams(window.location.search).get("agent") || "";
  const growth = useEmployeeGrowth(employeeId);
  if (!employeeId) return null;
  return (
    <section className={styles.panel} aria-label="本次成长">
      <header><h3>本次成长</h3>{growth.loading ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : null}</header>
      {growth.facts.length ? <div className={styles.facts}><strong>已记录事实</strong>{growth.facts.slice(-3).map((fact) => <p key={fact.id}>{fact.text}</p>)}</div> : null}
      {growth.error && !growth.proposals.length ? <p className={styles.empty}>成长记录暂不可用</p> : null}
      {!growth.loading && !growth.error && !growth.facts.length && !growth.proposals.length ? <p className={styles.empty}>本次暂无新的成长记录</p> : null}
      {growth.proposals.map((proposal) => <Proposal key={proposal.id} proposal={proposal} busy={growth.busyId === proposal.id} onApprove={() => void growth.approve(proposal.id)} onReject={() => void growth.reject(proposal.id)} />)}
    </section>
  );
}
