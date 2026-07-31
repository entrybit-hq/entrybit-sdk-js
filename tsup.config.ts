import { execSync } from "node:child_process";
import { defineConfig } from "tsup";

/**
 * Commit the bundle is built from, embedded via `define` (see
 * src/version.ts). git HEAD is asked first — it always describes the
 * checked-out tree, including the publish job's tag checkout, whereas
 * GITHUB_SHA is only the workflow-trigger commit and can diverge from the
 * built tree (so it is merely the git-less fallback). The commit SHA is
 * deterministic per release commit, so builds stay reproducible — never
 * embed a build timestamp here.
 */
function resolveBuildSha(): string {
  try {
    return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim();
  } catch {
    const envSha = process.env.GITHUB_SHA;
    return envSha ? envSha.slice(0, 12) : "unknown";
  }
}

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  treeshake: true,
  define: {
    __ENTRYBIT_BUILD_SHA__: JSON.stringify(resolveBuildSha()),
  },
});
