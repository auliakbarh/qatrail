import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// API version surfaced to the client (health query + sidebar). It is the newest
// git tag (v1.2.3 -> 1.2.3), read once at boot, so tagging a release is the only
// step. APP_VERSION overrides it; package.json is the fallback when the deploy
// has no tags (shallow clone, tarball).
function resolveVersion(): string {
  const env = process.env.APP_VERSION ?? "";
  if (env) return env.replace(/^v/, "");
  try {
    const tag = execSync("git describe --tags --abbrev=0", { stdio: ["ignore", "pipe", "ignore"] });
    return tag.toString().trim().replace(/^v/, "");
  } catch {
    // src/env.public.ts and dist/env.public.js sit at the same depth.
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  }
}

export const API_VERSION = resolveVersion();
