import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const miniprogramScripts = [
  "miniprogram/pages/room/room.js",
  "miniprogram/pages/create-room/create-room.js"
];

test("miniprogram page scripts avoid optional chaining and nullish coalescing for older mobile runtimes", () => {
  for (const relativePath of miniprogramScripts) {
    const absolutePath = path.join(projectRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    assert.equal(
      /\?\./.test(source),
      false,
      `${relativePath} should not contain optional chaining`
    );
    assert.equal(
      /\?\?/.test(source),
      false,
      `${relativePath} should not contain nullish coalescing`
    );
    assert.equal(
      /[0-9]_[0-9]/.test(source),
      false,
      `${relativePath} should not use numeric separators`
    );
    assert.equal(
      /catch\s*\{/.test(source),
      false,
      `${relativePath} should not use catch without a binding`
    );
  }
});
