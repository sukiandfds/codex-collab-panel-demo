interface ServiceWorkerRegistrationOptions {
  buildId: string;
  onUpdateAvailable: () => void;
}

export interface ServiceWorkerUpdateHandle {
  prepareUpdate: (buildId: string) => Promise<void>;
  activateUpdate: (buildId?: string) => Promise<void>;
  dispose: () => void;
}

const inactiveHandle: ServiceWorkerUpdateHandle = {
  prepareUpdate: async () => {},
  activateUpdate: async () => {},
  dispose: () => {},
};

const scriptUrl = (buildId: string) => `/sw.js?build=${encodeURIComponent(buildId)}`;

const waitForWaitingWorker = async (registration: ServiceWorkerRegistration) => {
  if (registration.waiting) return registration.waiting;
  const worker = registration.installing;
  if (!worker) return null;
  await new Promise<void>((resolve) => {
    const finish = () => {
      worker.removeEventListener("statechange", onStateChange);
      clearTimeout(timeout);
      resolve();
    };
    const onStateChange = () => {
      if (worker.state === "installed" || worker.state === "redundant") finish();
    };
    const timeout = window.setTimeout(finish, 5_000);
    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });
  return registration.waiting;
};

export function registerServiceWorker({ buildId, onUpdateAvailable }: ServiceWorkerRegistrationOptions): ServiceWorkerUpdateHandle {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return inactiveHandle;

  let disposed = false;
  let applying = false;
  let registration: ServiceWorkerRegistration | null = null;
  let initialController = Boolean(navigator.serviceWorker.controller);

  const observeRegistration = (nextRegistration: ServiceWorkerRegistration) => {
    registration = nextRegistration;
    if (nextRegistration.waiting && navigator.serviceWorker.controller) onUpdateAvailable();
    nextRegistration.addEventListener("updatefound", () => {
      const worker = nextRegistration.installing;
      worker?.addEventListener("statechange", () => {
        if (!disposed && worker.state === "installed" && navigator.serviceWorker.controller) onUpdateAvailable();
      });
    });
    return nextRegistration;
  };

  const registerBuild = async (nextBuildId: string) => {
    if (disposed) return null;
    try {
      return observeRegistration(await navigator.serviceWorker.register(scriptUrl(nextBuildId), {
        scope: "/",
        updateViaCache: "none",
      }));
    } catch {
      return null;
    }
  };

  let resolveInitialRegistration: (value: ServiceWorkerRegistration | null) => void = () => {};
  const initialRegistration = new Promise<ServiceWorkerRegistration | null>((resolve) => {
    resolveInitialRegistration = resolve;
  });
  const start = () => { void registerBuild(buildId).then(resolveInitialRegistration); };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });

  const onControllerChange = () => {
    if (initialController && !applying && !disposed) onUpdateAvailable();
    initialController = true;
  };
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  return {
    prepareUpdate: async (nextBuildId) => {
      const nextRegistration = await registerBuild(nextBuildId);
      if (nextRegistration) await waitForWaitingWorker(nextRegistration);
    },
    activateUpdate: async (nextBuildId) => {
      applying = true;
      const currentRegistration = nextBuildId
        ? await registerBuild(nextBuildId)
        : registration || await initialRegistration;
      const waiting = currentRegistration ? await waitForWaitingWorker(currentRegistration) : null;
      if (!waiting) return;
      await new Promise<void>((resolve) => {
        const finish = () => {
          navigator.serviceWorker.removeEventListener("controllerchange", finish);
          clearTimeout(timeout);
          resolve();
        };
        const timeout = window.setTimeout(finish, 3_000);
        navigator.serviceWorker.addEventListener("controllerchange", finish);
        waiting.postMessage({ type: "SKIP_WAITING" });
      });
    },
    dispose: () => {
      disposed = true;
      window.removeEventListener("load", start);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      resolveInitialRegistration(null);
    },
  };
}
