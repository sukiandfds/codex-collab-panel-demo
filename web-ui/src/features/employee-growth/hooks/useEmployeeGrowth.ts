import { useCallback, useEffect, useRef, useState } from "react";
import { hasAccessToken, withAccessToken } from "../../../shared/api/http";
import { employeeGrowthApi } from "../data/employeeGrowthApi";
import type { EmployeeGrowthResponse, GrowthFact, GrowthProposal, GrowthProposalStatus } from "../model/types";

const refreshIntervalMs = 8000;
const normalizeProposal = (item: GrowthProposal): GrowthProposal => {
  const raw = item as GrowthProposal & { kind?: string; text?: string; writeStatus?: string };
  return {
    ...raw,
    category: raw.category || raw.kind || "rule",
    content: raw.content || raw.text || "",
    status: raw.writeStatus === "failed" ? "failed" : raw.status === "pending" ? "ready" : raw.status,
  };
};
const normalize = (payload: EmployeeGrowthResponse | null | undefined): GrowthProposal[] => (
  Array.isArray(payload?.proposals) ? payload.proposals
    .filter((item) => item && item.id && (item.content || (item as GrowthProposal & { text?: string }).text))
    .map(normalizeProposal) : []
);

export function useEmployeeGrowth(employeeId: string) {
  const [facts, setFacts] = useState<GrowthFact[]>([]);
  const [proposals, setProposals] = useState<GrowthProposal[]>([]);
  const [loading, setLoading] = useState(Boolean(employeeId));
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const requestVersionRef = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (busyId) return;
    const requestVersion = ++requestVersionRef.current;
    if (!employeeId) { setFacts([]); setProposals([]); setLoading(false); return; }
    try {
      const result = await employeeGrowthApi.list(employeeId, signal);
      if (signal?.aborted || requestVersion !== requestVersionRef.current) return;
      setFacts(Array.isArray(result?.facts) ? result.facts.filter((item) => item?.id && item.text) : []);
      setProposals(normalize(result));
      setError("");
    } catch (reason) {
      if (!signal?.aborted && requestVersion === requestVersionRef.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (!signal?.aborted && requestVersion === requestVersionRef.current) setLoading(false);
    }
  }, [busyId, employeeId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(Boolean(employeeId));
    void refresh(controller.signal);
    if (!employeeId) return () => controller.abort();
    const timer = window.setInterval(() => void refresh(controller.signal), refreshIntervalMs);
    let source: EventSource | null = null;
    if (hasAccessToken && typeof EventSource !== "undefined") {
      source = new EventSource(withAccessToken("/events"));
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; employeeId?: string };
          if (payload.employeeId === employeeId && payload.type?.startsWith("employee_growth")) void refresh(controller.signal);
        } catch { /* polling remains the fallback */ }
      };
    }
    return () => { controller.abort(); window.clearInterval(timer); source?.close(); };
  }, [employeeId, refresh]);

  const setProposalStatus = useCallback((proposalId: string, status: GrowthProposalStatus) => {
    setProposals((current) => current.map((item) => item.id === proposalId ? { ...item, status } : item));
  }, []);
  const decide = useCallback(async (proposalId: string, action: "approve" | "reject") => {
    if (!employeeId || busyId) return false;
    requestVersionRef.current += 1;
    setBusyId(proposalId);
    setProposalStatus(proposalId, "pending");
    try {
      const result = action === "approve"
        ? await employeeGrowthApi.approve(employeeId, proposalId)
        : await employeeGrowthApi.reject(employeeId, proposalId);
      const normalized = normalizeProposal(result);
      setProposals((current) => current.map((item) => item.id === proposalId ? { ...item, ...normalized } : item));
      window.dispatchEvent(new CustomEvent("negus:project-status-changed"));
      return true;
    } catch (reason) {
      setProposalStatus(proposalId, "failed");
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally { setBusyId(""); }
  }, [busyId, employeeId, setProposalStatus]);

  return { facts, proposals, loading, error, busyId, approve: (id: string) => decide(id, "approve"), reject: (id: string) => decide(id, "reject"), refresh };
}
