import { useCallback, useEffect, useRef, useState } from "react";
import { registerServiceWorker, type ServiceWorkerUpdateHandle } from "../../../pwa/registerServiceWorker";
import { fetchWebVersion, type WebVersion } from "../data/versionApi";

const CHECK_INTERVAL_MS = 30_000;
const CLIENT_BUILD_ID = __APP_BUILD_ID__;

export function useAppUpdate() {
  const serviceWorker = useRef<ServiceWorkerUpdateHandle | null>(null);
  const [availableVersion, setAvailableVersion] = useState<WebVersion | null>(null);
  const [serviceWorkerUpdate, setServiceWorkerUpdate] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    let disposed = false;
    let checking = false;
    let preparedBuildId = "";
    const controller = new AbortController();
    const worker = registerServiceWorker({
      buildId: CLIENT_BUILD_ID,
      onUpdateAvailable: () => {
        if (!disposed) setServiceWorkerUpdate(true);
      },
    });
    serviceWorker.current = worker;

    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const version = await fetchWebVersion(controller.signal);
        if (version.buildId && version.buildId !== CLIENT_BUILD_ID && !disposed) {
          setAvailableVersion(version);
          if (preparedBuildId !== version.buildId) {
            preparedBuildId = version.buildId;
            void worker.prepareUpdate(version.buildId);
          }
        }
      } catch {
        // A temporary network or server restart should not replace the active task UI with an error.
      } finally {
        checking = false;
      }
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    void check();
    const interval = window.setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkWhenVisible);
    window.addEventListener("online", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", checkWhenVisible);
      window.removeEventListener("online", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      worker.dispose();
      serviceWorker.current = null;
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    if (applying) return;
    setApplying(true);
    try {
      await serviceWorker.current?.activateUpdate(availableVersion?.buildId);
    } finally {
      window.location.reload();
    }
  }, [applying, availableVersion?.buildId]);

  return {
    updateAvailable: Boolean(availableVersion) || serviceWorkerUpdate,
    applying,
    applyUpdate,
  };
}
