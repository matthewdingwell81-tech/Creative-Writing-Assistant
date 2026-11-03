import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// One canonical, cross-platform entry point. Never sync the migration backup,
// client/android, or a nonexistent artifacts/lumina/android project.
const root = fileURLToPath(new URL("../../", import.meta.url));
const web = path.join(root, "artifacts/lumina");
const rootRequire = createRequire(path.join(root, "package.json"));
const webRequire = createRequire(path.join(web, "package.json"));
const vite = path.join(path.dirname(webRequire.resolve("vite/package.json")), "bin/vite.js");
const capacitor = path.join(path.dirname(rootRequire.resolve("@capacitor/cli/package.json")), "bin/capacitor");

function run(script, args, cwd, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Building web assets, syncing ONLY the repository-root android/, and verifying native registration.");
run(vite, ["build", "--config", path.join(web, "vite.config.ts")], web, {
  ...process.env, PORT: "4173", BASE_PATH: "/",
});
run(capacitor, ["sync", "android"], root);
run(path.join(root, "scripts/android/verify.mjs"), [], root);
