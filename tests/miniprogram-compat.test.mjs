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

test("miniprogram includes babel runtime helper shims required by devtools ES6 transform", () => {
  const helperPaths = [
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/arrayWithHoles.js",
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/arrayLikeToArray.js",
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/arrayWithoutHoles.js",
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/iterableToArray.js",
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/iterableToArrayLimit.js",
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/nonIterableRest.js",
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/nonIterableSpread.js",
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/slicedToArray.js",
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/toConsumableArray.js",
    "miniprogram/miniprogram_npm/@babel/runtime/helpers/unsupportedIterableToArray.js"
  ];

  for (const relativePath of helperPaths) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, relativePath)),
      true,
      `${relativePath} should exist for WeChat DevTools runtime helper resolution`
    );
  }
});
