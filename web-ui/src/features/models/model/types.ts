export interface CodexModel {
  id: string;
  model: string;
  modelProviderId?: string;
  providerDisplayName?: string;
  available?: boolean;
  experimental?: boolean;
  displayName: string;
  description: string;
  isDefault: boolean;
  supportedReasoningEfforts: Array<{
    reasoningEffort: string;
    description: string;
  }>;
}

export interface ModelUpdateResult {
  model: string;
  modelProvider: string;
  reasoningEffort: string;
}
