import type { IntelligenceEfficiencySnapshot } from "../model/types";

const SNAPSHOT_URL = "https://codexradar.com/data/intelligence-efficiency.json";

export const readIntelligenceEfficiency = async (force = false, signal?: AbortSignal): Promise<IntelligenceEfficiencySnapshot> => {
  const response = await fetch(SNAPSHOT_URL, { signal, cache: force ? "reload" : "default" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json() as Partial<IntelligenceEfficiencySnapshot>;
  if (!Array.isArray(payload.points)) throw new Error("Invalid intelligence efficiency data");
  return {
    source_updated_at: String(payload.source_updated_at || ""),
    points: payload.points.filter((point) => (
      point
      && typeof point.model === "string"
      && typeof point.effort === "string"
      && Number.isFinite(point.iq)
      && Number.isFinite(point.average_minutes)
      && Number.isFinite(point.average_price_usd)
    )),
  };
};
