/**
 * build-asset-check.test.mjs
 *
 * Tests the REQUIRED_ASSETS assertion logic from build.mjs in isolation.
 * Each test spawns a small inline Node script that runs just the check
 * so we can inspect the real exit code and stderr output without running
 * a full esbuild compile.
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an inline ESM script that replicates the REQUIRED_ASSETS check from
 * build.mjs, using the supplied distDir and assets array.
 */
function makeCheckScript(distDir, assets) {
  return `
import { access } from "node:fs/promises";
import path from "node:path";

const distDir = ${JSON.stringify(distDir)};
const REQUIRED_ASSETS = ${JSON.stringify(assets)};

const missing = [];
for (const asset of REQUIRED_ASSETS) {
  const assetPath = path.join(distDir, asset.file);
  try {
    await access(assetPath);
  } catch {
    missing.push(asset);
  }
}

if (missing.length > 0) {
  console.error(
    "\\nBuild error: the following required asset files are missing from dist/:\\n" +
      missing.map(({ file, hint }) => \`  - \${file}  (\${hint})\`).join("\\n") +
      "\\n\\nAdd a copyFile() call in build.mjs to copy each missing file into dist/," +
      "\\nthen register it in the REQUIRED_ASSETS array so future builds catch regressions."
  );
  process.exit(1);
}

console.log(
  "Post-build asset check passed:",
  REQUIRED_ASSETS.map(({ file }) => file).join(", ")
);
`;
}

/** Spawn a node --input-type=module process and feed it the script via stdin. */
function runScript(scriptContent) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, ["--input-type=module"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));
    proc.stdin.write(scriptContent);
    proc.stdin.end();
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    failed++;
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const tempDir = await mkdtemp(path.join(tmpdir(), "build-asset-check-test-"));

try {
  // Pre-create table.sql so we have one real asset to work with
  await writeFile(path.join(tempDir, "table.sql"), "-- placeholder");

  // ── Test 1: all registered assets present → exits 0 ─────────────────────
  console.log("\nTest 1: all assets present");
  {
    const assets = [
      {
        file: "table.sql",
        hint: "copied from connect-pg-simple package",
      },
    ];
    const { code, stdout } = await runScript(makeCheckScript(tempDir, assets));
    ok("exits with code 0", code === 0, `exit code was ${code}`);
    ok(
      "stdout confirms check passed",
      stdout.includes("Post-build asset check passed"),
      `stdout: ${stdout.trim()}`
    );
  }

  // ── Test 2: single missing asset → exits 1, names file and hint ──────────
  console.log("\nTest 2: single missing asset");
  {
    const assets = [
      {
        file: "missing-asset.html",
        hint: "copied from src/emails/welcome.html",
      },
    ];
    const { code, stderr } = await runScript(makeCheckScript(tempDir, assets));
    ok("exits with code 1", code === 1, `exit code was ${code}`);
    ok(
      "stderr names the missing file",
      stderr.includes("missing-asset.html"),
      `stderr: ${stderr.trim()}`
    );
    ok(
      "stderr includes the hint",
      stderr.includes("copied from src/emails/welcome.html"),
      `stderr: ${stderr.trim()}`
    );
  }

  // ── Test 3: multiple assets, one missing → exits 1, only missing listed ──
  console.log("\nTest 3: partial — one of two assets missing");
  {
    const assets = [
      {
        file: "table.sql",
        hint: "this one is present",
      },
      {
        file: "not-there.json",
        hint: "this one is absent",
      },
    ];
    const { code, stderr } = await runScript(makeCheckScript(tempDir, assets));
    ok("exits with code 1", code === 1, `exit code was ${code}`);
    ok(
      "stderr names the absent file",
      stderr.includes("not-there.json"),
      `stderr: ${stderr.trim()}`
    );
    ok(
      "stderr does not list the present file as missing",
      !stderr.includes("table.sql"),
      `stderr: ${stderr.trim()}`
    );
  }

  // ── Test 4: empty REQUIRED_ASSETS list → exits 0 ─────────────────────────
  console.log("\nTest 4: empty REQUIRED_ASSETS list");
  {
    const assets = [];
    const { code, stdout } = await runScript(makeCheckScript(tempDir, assets));
    ok("exits with code 0", code === 0, `exit code was ${code}`);
    ok(
      "stdout confirms check passed",
      stdout.includes("Post-build asset check passed"),
      `stdout: ${stdout.trim()}`
    );
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
