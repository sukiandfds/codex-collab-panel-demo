import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppUpdateNotice } from "./features/app-update/components/AppUpdateNotice";
import "./styles/tokens.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <AppUpdateNotice surface="conversation" />
  </StrictMode>,
);
