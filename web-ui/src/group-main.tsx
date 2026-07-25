import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GroupApp } from "./features/group-chat/GroupApp";
import "./features/group-chat/group-global.css";
import { registerServiceWorker } from "./pwa/registerServiceWorker";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GroupApp />
  </StrictMode>,
);
