import { fetchJson, postJson } from "../../../shared/api/http";
import type { EmployeeCapabilityResponse } from "../model/types";

export const employeeCapabilityApi = {
  status: (employeeId: string, signal?: AbortSignal) => fetchJson<EmployeeCapabilityResponse>(
    `/api/employee/status?employeeId=${encodeURIComponent(employeeId)}`,
    signal,
  ),
  confirm: (employeeId: string, signal?: AbortSignal) => postJson<EmployeeCapabilityResponse>(
    "/api/employee/confirm",
    { employeeId },
    signal,
  ),
};
