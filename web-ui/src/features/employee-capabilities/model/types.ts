export interface EmployeeRuntimeStatus {
  phase?: string;
  label?: string;
  detail?: string;
  active?: boolean;
  turnId?: string | null;
  updatedAt?: string | null;
}

export interface EmployeeIdentity {
  id: string;
  name: string;
  shortName?: string;
  responsibility?: string;
  projectKey?: string;
  runtimeKind?: string;
  mainThreadId?: string | null;
  conversationId?: string | null;
  modificationConfirmed?: boolean;
}

export interface EmployeeCapabilityResponse {
  employee?: EmployeeIdentity | null;
  status?: EmployeeRuntimeStatus | null;
  modificationConfirmed?: boolean;
  threadId?: string | null;
  conversationId?: string | null;
}
