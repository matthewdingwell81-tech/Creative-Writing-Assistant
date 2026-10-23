import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin.ts";

test("discovers public TSX mockups, excluding private and hidden paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-"));
  try {
    const plugin = mockupPreviewPlugin();
    plugin.configResolved({ root });
    // Missing mockup directories should generate an empty module, not fail.
    await plugin.buildStart();
    const generated = path.join(root, "src/.generated/mockup-components.ts");
    assert.match(await readFile(generated, "utf8"), /modules: ModuleMap = \{\n\n\}/);

    const files = [
      "Zed.tsx",
      "nested/Alpha.tsx",
      "_private.tsx",
      "_internal/Hidden.tsx",
      "nested/_private/Hidden.tsx",
      ".hidden.tsx",
      ".hidden/Hidden.tsx",
      "not-a-component.ts",
    ];
    for (const file of files) {
      const target = path.join(root, "src/components/mockups", file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "export default () => null;\n");
    }
    await plugin.buildStart();
    const source = await readFile(generated, "utf8");
    assert.match(source, /"\.\/components\/mockups\/Zed\.tsx"/);
    assert.match(source, /import\("\.\.\/components\/mockups\/nested\/Alpha\.tsx"\)/);
    assert.equal((source.match(/=> import/g) ?? []).length, 2);
    assert.ok(source.indexOf("Zed.tsx") < source.indexOf("nested/Alpha.tsx"));

    // Rescans reflect both removals and additions.
    await rm(path.join(root, "src/components/mockups/Zed.tsx"));
    await writeFile(path.join(root, "src/components/mockups/New.tsx"), "");
    await plugin.buildStart();
    const refreshed = await readFile(generated, "utf8");
    assert.doesNotMatch(refreshed, /Zed/);
    assert.match(refreshed, /New\.tsx/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
