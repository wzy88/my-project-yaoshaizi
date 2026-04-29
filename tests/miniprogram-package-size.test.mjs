import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MINIPROGRAM_ROOT = path.resolve("miniprogram");
const MAX_MAIN_PACKAGE_BYTES = 2 * 1024 * 1024;

function getDirectorySizeBytes(dirPath) {
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySizeBytes(entryPath);
      continue;
    }
    total += fs.statSync(entryPath).size;
  }
  return total;
}

test("miniprogram main package stays under the 2MB real-device limit", () => {
  const totalBytes = getDirectorySizeBytes(MINIPROGRAM_ROOT);
  assert.ok(
    totalBytes < MAX_MAIN_PACKAGE_BYTES,
    `miniprogram package is ${(totalBytes / 1024 / 1024).toFixed(3)}MB, expected < 2.000MB`
  );
});
