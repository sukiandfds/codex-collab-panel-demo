import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: "index.html", group: "group.html" },
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
});
