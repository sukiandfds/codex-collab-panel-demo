import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppUpdateNotice } from "./features/app-update/components/AppUpdateNotice";
import { GroupApp } from "./features/group-chat/GroupApp";
import "./features/group-chat/group-global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GroupApp />
    <AppUpdateNotice surface="group" />
  </StrictMode>,
);
