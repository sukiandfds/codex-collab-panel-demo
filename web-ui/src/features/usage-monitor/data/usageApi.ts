import { fetchJson } from "../../../shared/api/http";
import type { FushengUsageSnapshot } from "../model/types";

export const usageApi = {
  read: (force = false, turnId = "", signal?: AbortSignal) => {
    const parameters = new URLSearchParams();
    if (force) parameters.set("refresh", "1");
    if (turnId) parameters.set("turnId", turnId);
    const parameterText = parameters.toString();
    const query = parameterText ? `?${parameterText}` : "";
    return fetchJson<FushengUsageSnapshot>(`/api/usage/fusheng${query}`, signal);
  },
};
