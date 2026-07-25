import { fetchJson } from "../../conversations/data/http";
import type { DeviceInfo } from "../model/types";

export const deviceApi = {
  info: (signal?: AbortSignal) => fetchJson<DeviceInfo>("/api/device", signal),
};
