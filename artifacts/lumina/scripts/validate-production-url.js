#!/usr/bin/env node

const raw = process.env.LUMINA_PRODUCTION_URL;

if (raw === undefined) {
  console.log(
    "LUMINA_PRODUCTION_URL is not set — using default https://lumina.replit.app"
  );
  process.exit(0);
}

const url = raw.trim();

if (url === "") {
  console.error(
    `\nError: LUMINA_PRODUCTION_URL is set but empty.\n` +
      `  The Android app will use an empty server URL, which is broken.\n` +
      `  Fix: either unset the variable (to use the default) or set it to a valid HTTPS URL, e.g.\n` +
      `       export LUMINA_PRODUCTION_URL=https://lumina.replit.app\n`
  );
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(
    `\nError: LUMINA_PRODUCTION_URL is not a valid URL.\n` +
      `  Got: ${JSON.stringify(url)}\n` +
      `  Fix: set it to a well-formed HTTPS URL, e.g.\n` +
      `       export LUMINA_PRODUCTION_URL=https://lumina.replit.app\n`
  );
  process.exit(1);
}

if (parsed.protocol !== "https:") {
  console.error(
    `\nError: LUMINA_PRODUCTION_URL must use HTTPS (got "${parsed.protocol.replace(":", "")}").\n` +
      `  Got: ${JSON.stringify(url)}\n` +
      `  Fix: use an https:// URL, e.g.\n` +
      `       export LUMINA_PRODUCTION_URL=https://lumina.replit.app\n`
  );
  process.exit(1);
}

if (!parsed.hostname || parsed.hostname === "") {
  console.error(
    `\nError: LUMINA_PRODUCTION_URL has no hostname.\n` +
      `  Got: ${JSON.stringify(url)}\n` +
      `  Fix: use a full HTTPS URL with a hostname, e.g.\n` +
      `       export LUMINA_PRODUCTION_URL=https://lumina.replit.app\n`
  );
  process.exit(1);
}

console.log(`LUMINA_PRODUCTION_URL OK: ${url}`);
process.exit(0);
