import { fetchJson, postJson } from "../../../shared/api/http";
import type { EmployeeGrowthResponse, GrowthProposal } from "../model/types";

const requestId = () => globalThis.crypto?.randomUUID?.() || `growth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const employeeGrowthApi = {
  list: (employeeId: string, signal?: AbortSignal) => fetchJson<EmployeeGrowthResponse>(`/api/employee-growth?employeeId=${encodeURIComponent(employeeId)}`, signal),
  approve: (employeeId: string, proposalId: string, signal?: AbortSignal) => postJson<GrowthProposal>("/api/employee-growth/approve", { employeeId, proposalId, requestId: requestId() }, signal),
  reject: (employeeId: string, proposalId: string, signal?: AbortSignal) => postJson<GrowthProposal>("/api/employee-growth/reject", { employeeId, proposalId, requestId: requestId() }, signal),
};
