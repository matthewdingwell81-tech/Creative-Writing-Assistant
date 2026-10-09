import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = fileURLToPath(new URL("./post-merge.sh", import.meta.url));
const commands = [
  "install --frozen-lockfile",
  "--filter @workspace/api-spec run codegen",
  "run typecheck",
  "--filter @workspace/db run migrate:planning",
  "--filter @workspace/db run migrate:coach",
];

function withMockPnpm(check) {
  const dir = mkdtempSync(join(tmpdir(), "post-merge-test-"));
  const log = join(dir, "commands.log");
  writeFileSync(
    join(dir, "pnpm"),
    `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$COMMAND_LOG"
# Any interactive read must see EOF, just as it does during a task merge.
if read -r unexpected; then
  echo "Unexpected interactive input" >&2
  exit 99
fi
if [[ "$*" == "\${FAIL_COMMAND:-}" ]]; then
  exit 42
fi
`,
    { mode: 0o755 },
  );
  const run = (failCommand = "") =>
    spawnSync("bash", [script], {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        COMMAND_LOG: log,
        FAIL_COMMAND: failCommand,
      },
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  const calls = () => readFileSync(log, "utf8").trim().split("\n");
  try {
    check({ run, calls });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("reconciliation is ordered, repeatable, and noninteractive", () => {
  withMockPnpm(({ run, calls }) => {
    for (let i = 0; i < 2; i++) {
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Post-merge setup completed\./);
    }
    assert.deepEqual(calls(), [...commands, ...commands]);
  });
});

const stages = [
  "dependency installation",
  "API client/schema generation and library type checking",
  "workspace type checking",
  "planning migration",
  "Coach migration",
];

for (const [index, command] of commands.entries()) {
  test(`fails clearly and stops when ${stages[index]} fails`, () => {
    withMockPnpm(({ run, calls }) => {
      const result = run(command);
      assert.equal(result.status, 42);
      assert.ok(result.stderr.includes(`failed during ${stages[index]} (exit 42)`));
      assert.doesNotMatch(result.stdout, /Post-merge setup completed\./);
      assert.deepEqual(calls(), commands.slice(0, index + 1));
    });
  });
}
