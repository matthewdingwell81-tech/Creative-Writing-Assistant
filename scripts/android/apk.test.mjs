import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { GOOGLE_CLASS, GOOGLE_PACKAGE, readZipEntries, dexDefinesClass, verifyApk } from "./apk.mjs";

// Minimal synthetic ZIP/DEX structures exercise the verifier without an SDK.
function dex(defined = true) {
  const descriptor = Buffer.from(`L${GOOGLE_CLASS.replaceAll(".", "/")};`);
  const bytes = Buffer.alloc(160 + descriptor.length + 2);
  bytes.write("dex\n035\0");
  bytes.writeUInt32LE(112, 60); // string_ids_off
  bytes.writeUInt32LE(116, 68); // type_ids_off
  bytes.writeUInt32LE(defined ? 1 : 0, 96);
  bytes.writeUInt32LE(120, 100); // class_defs_off
  bytes.writeUInt32LE(160, 112); // string data
  bytes[160] = descriptor.length;
  descriptor.copy(bytes, 161);
  return bytes;
}

function zip(files, compressed = false) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const payload = compressed ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(compressed ? 8 : 0, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt16LE(filename.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50);
    header.writeUInt16LE(compressed ? 8 : 0, 10);
    header.writeUInt32LE(payload.length, 20);
    header.writeUInt16LE(filename.length, 28);
    header.writeUInt32LE(offset, 42);
    parts.push(local, filename, payload);
    central.push(header, filename);
    offset += local.length + filename.length + payload.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

function fixture(defined = true, registered = true) {
  return {
    "assets/capacitor.plugins.json": Buffer.from(JSON.stringify(registered
      ? [{ pkg: GOOGLE_PACKAGE, classpath: GOOGLE_CLASS }] : [])),
    "assets/capacitor.config.json": Buffer.from(JSON.stringify({
      appId: "com.lumina.app", server: { url: "https://example.test" },
    })),
    "classes2.dex": dex(defined),
  };
}

test("checks class definitions, not merely matching DEX strings/references", () => {
  assert.equal(dexDefinesClass(dex(), GOOGLE_CLASS), true);
  assert.equal(dexDefinesClass(dex(false), GOOGLE_CLASS), false);
});
for (const compressed of [false, true]) {
  test(`verifies registry plus defined native class (ZIP deflated=${compressed})`, () => {
    assert.equal(verifyApk(zip(fixture(), compressed)).appId, "com.lumina.app");
    assert(readZipEntries(zip(fixture(), compressed)).has("classes2.dex"));
  });
}
test("rejects a registered but absent native class", () => {
  assert.throws(() => verifyApk(zip(fixture(false))), /does not DEFINE/);
});
test("rejects a native class without its registry entry", () => {
  assert.throws(() => verifyApk(zip(fixture(true, false))), /does not register/);
});
test("rejects an unrelated or corrupt file", () => {
  assert.throws(() => verifyApk(Buffer.from("not an APK")), /central directory/);
});
