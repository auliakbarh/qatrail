import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// UI version baked into the bundle at build time: the newest git tag
// (v1.2.3 -> 1.2.3). APP_VERSION overrides it; package.json is the fallback
// when the checkout has no tags (shallow CI clone, tarball).
function appVersion(): string {
  const env = process.env.APP_VERSION ?? "";
  if (env) return env.replace(/^v/, "");
  try {
    const tag = execSync("git describe --tags --abbrev=0", { stdio: ["ignore", "pipe", "ignore"] });
    return tag.toString().trim().replace(/^v/, "");
  } catch {
    return JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")).version;
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 5173 },
});
