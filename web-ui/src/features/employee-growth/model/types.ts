export type GrowthCategory = "fact" | "rule" | "skill" | string;
export type GrowthProposalStatus = "ready" | "pending" | "approved" | "rejected" | "failed";

export interface GrowthFact {
  id: string;
  text: string;
  createdAt?: string;
  status?: string;
}

export interface GrowthProposal {
  id: string;
  category: GrowthCategory;
  title?: string;
  content: string;
  status: GrowthProposalStatus;
  createdAt?: string;
  error?: string;
}

export interface EmployeeGrowthResponse {
  version?: number;
  employeeId?: string;
  facts?: GrowthFact[];
  proposals?: GrowthProposal[];
}
