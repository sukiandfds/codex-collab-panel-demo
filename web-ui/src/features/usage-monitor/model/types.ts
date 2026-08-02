export interface FushengUsageSnapshot {
  provider: "fusheng";
  updatedAt: string;
  queryDate: string;
  today: {
    amountUsd: number;
    requests: number;
    tokens: number;
  };
  account: {
    balanceUsd: number;
    historicalUsageUsd: number;
    historicalRequests: number;
  };
  featuredGroup: {
    name: string;
    ratio: number | null;
  };
  groupRatios: Record<string, number>;
}
