import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProjectProgressApp } from "./features/project-progress/ProjectProgressApp";
import "./styles/tokens.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProjectProgressApp />
  </StrictMode>,
);
