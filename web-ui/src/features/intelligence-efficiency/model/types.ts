export interface IntelligenceEfficiencyPoint {
  model: string;
  effort: string;
  iq: number;
  average_minutes: number;
  average_price_usd: number;
  valid_tasks?: number;
}

export interface IntelligenceEfficiencySnapshot {
  source_updated_at: string;
  points: IntelligenceEfficiencyPoint[];
}
