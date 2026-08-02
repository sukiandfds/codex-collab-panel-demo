export interface ProjectManagementUpdate {
  at: string | null;
  status: string;
  statusLabel: string;
  change: string;
  userImpact: string;
  evidence: string;
  entryId?: string;
  title?: string;
  category?: string;
  priority?: string | null;
}

export interface ProjectManagementEntry {
  id: string;
  type: string;
  typeLabel: string;
  category: string;
  title: string;
  summary: string;
  priority: string | null;
  status: string;
  statusLabel: string;
  updatedAt: string | null;
  updateSummary: string;
  userQuote?: string;
  initialAnalysis?: string;
  concreteContent?: string;
  expectedEffect?: string;
  relatedItems?: string[];
  sourcePath?: string;
  updatesPath?: string;
  updates?: ProjectManagementUpdate[];
  evidence?: string[];
}

export interface ProjectManagementEntryDetail extends ProjectManagementEntry {
  userQuote: string;
  initialAnalysis: string;
  concreteContent: string;
  expectedEffect: string;
  relatedItems: string[];
  sourcePath: string;
  updatesPath: string;
  updates: ProjectManagementUpdate[];
  evidence: string[];
}

export interface ProjectManagementCategory {
  name: string;
  entries: ProjectManagementEntry[];
}

export interface ProjectManagementProject {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  health: string;
  goal: string;
  phase: string;
  lead: string;
  updatedAt: string | null;
  source: string;
}

export interface ProjectManagementDocument {
  project: ProjectManagementProject;
  plan: ProjectManagementEntry[];
  inProgress: ProjectManagementEntry[];
  categories: ProjectManagementCategory[];
  entries: ProjectManagementEntry[];
  recentUpdates: ProjectManagementUpdate[];
  stats: {
    total: number;
    inProgress: number;
    blocked: number;
    completed: number;
  };
  updatedAt: string;
  source: string;
}
