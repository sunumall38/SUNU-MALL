/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

// Version affichée dans l'application : le fichier VERSION du dépôt (source
// unique, mis à jour par scripts/release.sh) et le commit construit, fourni
// par Cloudflare Pages (CF_PAGES_COMMIT_SHA) ou la CI (GITHUB_SHA).
function appVersion() {
  try {
    return readFileSync(path.resolve(__dirname, "../VERSION"), "utf-8").trim();
  } catch {
    return process.env.npm_package_version ?? "0.0.0-dev";
  }
}
const appCommit = (process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "").slice(0, 7);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __APP_COMMIT__: JSON.stringify(appCommit),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3004,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
