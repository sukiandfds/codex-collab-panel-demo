import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const createVersionAssetPlugin = (buildId: string, builtAt: string): Plugin => ({
  name: "negus-version-asset",
  apply: "build",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: `${JSON.stringify({ buildId, builtAt }, null, 2)}\n`,
    });
  },
});

export default defineConfig(({ command }) => {
  const builtAt = new Date().toISOString();
  const buildId = command === "build" ? `web-${Date.now().toString(36)}` : "development";

  return {
    plugins: [react(), createVersionAssetPlugin(buildId, builtAt)],
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    build: {
      rollupOptions: {
        input: {
          main: "index.html",
          group: "group.html",
          progress: "progress.html",
          projectManagement: "project-management.html",
        },
      },
    },
    server: {
      proxy: {
        "/api": "http://127.0.0.1:9360",
        "/events": "http://127.0.0.1:9360",
      },
    },
    preview: {
      proxy: {
        "/api": "http://127.0.0.1:9360",
        "/events": "http://127.0.0.1:9360",
      },
    },
  };
});
