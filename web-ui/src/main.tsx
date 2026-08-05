import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppUpdateNotice } from "./features/app-update/components/AppUpdateNotice";
import "./styles/tokens.css";
import "./styles/global.css";

const launchScreen = document.getElementById("negus-launch");
let launchDismissed = false;
const dismissLaunchScreen = () => {
  if (!launchScreen || launchDismissed) return;
  launchDismissed = true;
  const delay = Math.max(0, 900 - performance.now());
  window.setTimeout(() => {
    launchScreen.classList.add("negus-launch-leaving");
    window.setTimeout(() => launchScreen.remove(), 320);
  }, delay);
};

window.addEventListener("negus:app-ready", dismissLaunchScreen, { once: true });
window.setTimeout(dismissLaunchScreen, 4000);

let viewportFrame = 0;
const applyViewportGeometry = () => {
  const viewport = window.visualViewport;
  const height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
  const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
  document.documentElement.style.setProperty("--app-viewport-height", `${height}px`);
  document.documentElement.style.setProperty("--app-viewport-offset-top", `${offsetTop}px`);
};

const scheduleViewportGeometry = () => {
  window.cancelAnimationFrame(viewportFrame);
  viewportFrame = window.requestAnimationFrame(applyViewportGeometry);
};

applyViewportGeometry();
window.addEventListener("resize", scheduleViewportGeometry, { passive: true });
window.visualViewport?.addEventListener("resize", scheduleViewportGeometry, { passive: true });
window.visualViewport?.addEventListener("scroll", scheduleViewportGeometry, { passive: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <AppUpdateNotice surface="conversation" />
  </StrictMode>,
);
