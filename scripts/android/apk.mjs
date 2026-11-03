import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";

export const GOOGLE_PACKAGE = "@capawesome/capacitor-google-sign-in";
export const GOOGLE_CLASS = "io.capawesome.capacitorjs.plugins.googlesignin.GoogleSignInPlugin";

// APKs are ZIP files. Read the central directory (not a filename/strings search).
// The APK signing block is before this directory and does not change its offsets.
export function readZipEntries(bytes, select = () => true) {
  let end = bytes.length - 22;
  const minimum = Math.max(0, bytes.length - 65557);
  while (end >= minimum) {
    if (bytes.readUInt32LE(end) === 0x06054b50 &&
        end + 22 + bytes.readUInt16LE(end + 20) === bytes.length) break;
    end--;
  }
  assert(end >= minimum, "APK has no valid ZIP central directory");
  const count = bytes.readUInt16LE(end + 10);
  assert.notEqual(count, 0xffff, "ZIP64 APKs are not supported by this verifier");
  let offset = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50, "Invalid ZIP entry");
    const method = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const nameSize = bytes.readUInt16LE(offset + 28);
    const extraSize = bytes.readUInt16LE(offset + 30);
    const commentSize = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameSize);
    if (select(name)) {
      assert.equal(bytes.readUInt32LE(local), 0x04034b50, "Invalid ZIP local entry");
      const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      assert(start + size <= bytes.length, "Truncated APK entry");
      const compressed = bytes.subarray(start, start + size);
      assert(method === 0 || method === 8, `Unsupported ZIP compression: ${method}`);
      entries.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    }
    offset += 46 + nameSize + extraSize + commentSize;
  }
  return entries;
}

export function dexDefinesClass(bytes, className) {
  assert(bytes.length >= 112 && bytes.toString("ascii", 0, 4) === "dex\n", "Invalid DEX file");
  const descriptor = `L${className.replaceAll(".", "/")};`;
  const strings = bytes.readUInt32LE(60);
  const types = bytes.readUInt32LE(68);
  const count = bytes.readUInt32LE(96);
  const classes = bytes.readUInt32LE(100);
  // Inspect class_defs, not arbitrary references in the DEX string table.
  for (let i = 0; i < count; i++) {
    const typeIndex = bytes.readUInt32LE(classes + i * 32);
    const stringIndex = bytes.readUInt32LE(types + typeIndex * 4);
    let start = bytes.readUInt32LE(strings + stringIndex * 4);
    let lengthBytes = 0;
    while (bytes[start++] & 0x80) assert(++lengthBytes < 5, "Invalid DEX string length");
    const end = bytes.indexOf(0, start);
    assert(end >= start, "Unterminated DEX descriptor");
    if (bytes.toString("utf8", start, end) === descriptor) return true;
  }
  return false;
}

export function verifyApk(bytes) {
  const entries = readZipEntries(bytes, name =>
    /^classes\d*\.dex$/.test(name) || [
      "assets/capacitor.plugins.json", "assets/capacitor.config.json",
    ].includes(name),
  );
  const registry = entries.get("assets/capacitor.plugins.json");
  assert(registry, "APK is missing assets/capacitor.plugins.json");
  assert(JSON.parse(registry.toString()).some(p =>
    p.pkg === GOOGLE_PACKAGE && p.classpath === GOOGLE_CLASS,
  ), "APK plugin registry does not register GoogleSignIn");
  assert([...entries].some(([name, data]) =>
    /^classes\d*\.dex$/.test(name) && dexDefinesClass(data, GOOGLE_CLASS),
  ), "APK does not DEFINE the GoogleSignInPlugin native class");
  const config = entries.get("assets/capacitor.config.json");
  assert(config, "APK is missing its Capacitor config");
  const parsed = JSON.parse(config.toString());
  assert.equal(parsed.appId, "com.lumina.app", "Wrong app APK");
  assert(parsed.server?.url?.startsWith("https://"), "APK is not configured for its HTTPS remote website");
  return parsed;
}
