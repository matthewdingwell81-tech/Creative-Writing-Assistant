import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GOOGLE_PACKAGE, GOOGLE_CLASS, verifyApk } from "./apk.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = relative => readFileSync(path.join(root, relative), "utf8");
const json = relative => JSON.parse(read(relative));

try {
  const rootPackage = json("package.json");
  const webPackage = json("artifacts/lumina/package.json");
  const version = rootPackage.dependencies[GOOGLE_PACKAGE];
  assert.equal(webPackage.dependencies[GOOGLE_PACKAGE], version, "Web and native package pins differ");
  const nativeRequire = createRequire(path.join(root, "package.json"));
  const webRequire = createRequire(path.join(root, "artifacts/lumina/package.json"));
  for (const require of [nativeRequire, webRequire]) {
    const metadataPath = require.resolve(`${GOOGLE_PACKAGE}/package.json`);
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    assert.equal(metadata.version, version, "Installed plugin does not match its exact version pin");
    assert.equal(metadata.capacitor.android.src, "android");
    const base = path.dirname(metadataPath);
    const js = readFileSync(path.join(base, "dist/esm/index.js"), "utf8");
    const java = readFileSync(path.join(base, "android/src/main/java",
      ...GOOGLE_CLASS.split(".").slice(0, -1), "GoogleSignInPlugin.java"), "utf8");
    assert.match(js, /registerPlugin\(['"]GoogleSignIn['"]/);
    assert.match(java, /@CapacitorPlugin\(name\s*=\s*"GoogleSignIn"\)/);
    for (const method of ["initialize", "signIn", "signOut"]) {
      assert.match(java, new RegExp(`@PluginMethod\\s+public void ${method}\\(`));
    }
  }
  assert.match(read("artifacts/lumina/src/hooks/useAuth.ts"),
    /import \{ GoogleSignIn \} from "@capawesome\/capacitor-google-sign-in"/);
  const registry = json("android/app/src/main/assets/capacitor.plugins.json");
  assert(registry.some(p => p.pkg === GOOGLE_PACKAGE && p.classpath === GOOGLE_CLASS),
    "Root android/ plugin registry is missing GoogleSignIn. Run pnpm exec cap sync android from the repository root.");
  const settings = read("android/capacitor.settings.gradle");
  const nativePath = settings.match(
    /project\(':capawesome-capacitor-google-sign-in'\)\.projectDir = new File\('([^']+)'\)/,
  );
  assert(nativePath, "Gradle settings omit the GoogleSignIn native module");
  assert(existsSync(path.resolve(root, "android", nativePath[1])), "Gradle plugin directory does not exist; resync after installing dependencies");
  assert.match(read("android/app/capacitor.build.gradle"),
    /implementation project\(':capawesome-capacitor-google-sign-in'\)/);
  const config = json("android/app/src/main/assets/capacitor.config.json");
  console.log(`Source PASS: ${GOOGLE_PACKAGE}@${version}; JS/native name = GoogleSignIn`);
  console.log(`Registry PASS: ${GOOGLE_CLASS}; native Gradle project exists`);
  console.log(`Android loads remote website: ${config.server?.url ?? "NO REMOTE URL"}`);

  const args = process.argv.slice(2).filter(a => a !== "--");
  if (args.length) {
    assert(args.length === 2 && args[0] === "--apk", "Usage: pnpm android:verify [--apk path/to/app.apk]");
    const apk = verifyApk(readFileSync(path.resolve(args[1])));
    assert.equal(apk.server.url, config.server.url, "APK remote URL differs from the current synced project");
    console.log(`APK PASS: registry entry AND a defined DEX native class; remote URL = ${apk.server.url}`);
  } else {
    console.log("APK NOT checked. Pass --apk android/app/build/outputs/apk/debug/app-debug.apk after building.");
  }
  console.log("Runtime NOT proven by these checks. Run GoogleSignInBridgeTest on Android to invoke initialize through the live bridge.");
} catch (error) {
  console.error(`Android verification FAILED: ${error.message}`);
  process.exitCode = 1;
}
