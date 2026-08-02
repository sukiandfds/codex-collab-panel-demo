import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProjectManagementApp } from "./features/project-management/ProjectManagementApp";
import "./styles/tokens.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProjectManagementApp />
  </StrictMode>,
);
