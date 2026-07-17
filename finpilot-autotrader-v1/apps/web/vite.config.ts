import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4311,
    proxy: {
      "/api": "http://127.0.0.1:4310",
      "/ws": { target: "ws://127.0.0.1:4310", ws: true }
    }
  },
  build: { outDir: "dist", emptyOutDir: true }
});
