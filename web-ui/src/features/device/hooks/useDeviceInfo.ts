import { useEffect, useState } from "react";
import { deviceApi } from "../data/deviceApi";
import type { DeviceInfo } from "../model/types";

export function useDeviceInfo(connected: boolean) {
  const [device, setDevice] = useState<DeviceInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void deviceApi.info(controller.signal).then(setDevice).catch(() => {});
    return () => controller.abort();
  }, [connected]);

  return device;
}
