import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, copyFile, access } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  // connect-pg-simple reads table.sql at runtime when createTableIfMissing is true.
  // esbuild only bundles JS, so we must copy the SQL file into dist/ explicitly.
  const pgSimpleDir = path.dirname(
    createRequire(import.meta.url).resolve("connect-pg-simple")
  );
  await copyFile(
    path.join(pgSimpleDir, "table.sql"),
    path.join(distDir, "table.sql")
  );

  // ─── Required non-JS runtime assets ────────────────────────────────────────
  // List every file that must be present in dist/ at server startup.
  // esbuild only bundles JS — any file read at runtime via fs/path must be
  // copied here explicitly and registered in this array.
  //
  // HOW TO ADD A NEW ASSET:
  //   1. Add a copyFile() call above that copies the file into dist/.
  //   2. Add an entry to REQUIRED_ASSETS below with a "hint" describing
  //      where the source file lives (so the error message is actionable).
  //
  // The post-build assertion below will exit the build non-zero if any
  // registered asset is missing, preventing a broken server from shipping.
  // ───────────────────────────────────────────────────────────────────────────
  const REQUIRED_ASSETS = [
    {
      file: "table.sql",
      hint: "copied from connect-pg-simple package — see the copyFile() call above",
    },
    // Example for future assets:
    // { file: "emails/welcome.html", hint: "copied from src/emails/welcome.html" },
  ];

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
      `\nBuild error: the following required asset files are missing from dist/:\n` +
        missing.map(({ file, hint }) => `  - ${file}  (${hint})`).join("\n") +
        `\n\nAdd a copyFile() call in build.mjs to copy each missing file into dist/,` +
        `\nthen register it in the REQUIRED_ASSETS array so future builds catch regressions.`
    );
    process.exit(1);
  }

  console.log(
    "Post-build asset check passed:",
    REQUIRED_ASSETS.map(({ file }) => file).join(", ")
  );
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
