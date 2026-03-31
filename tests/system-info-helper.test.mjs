import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const helperRelativePath = "miniprogram/utils/system-info.js";
const helperAbsolutePath = path.join(projectRoot, helperRelativePath);
const legacyCallerPaths = [
  "miniprogram/app.js",
  "miniprogram/pages/create-room/create-room.js",
  "miniprogram/pages/me/me.js",
  "miniprogram/pages/room/room.js"
];

test("miniprogram platform detection uses non-deprecated system APIs", () => {
  for (const relativePath of legacyCallerPaths) {
    const absolutePath = path.join(projectRoot, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");

    assert.equal(
      /getSystemInfoSync\s*\(/.test(source),
      false,
      `${relativePath} should avoid calling wx.getSystemInfoSync directly`
    );
  }

  assert.equal(
    fs.existsSync(helperAbsolutePath),
    true,
    `${helperRelativePath} should exist`
  );

  const helper = require(helperAbsolutePath);
  assert.equal(typeof helper.isDevtoolsPlatform, "function");
  assert.equal(typeof helper.getNavigationSafeArea, "function");

  const originalWx = globalThis.wx;

  try {
    globalThis.wx = {
      getDeviceInfo() {
        return { platform: "devtools" };
      }
    };
    assert.equal(helper.isDevtoolsPlatform(), true);

    globalThis.wx = {
      getDeviceInfo() {
        return { platform: "android" };
      },
      getSystemInfoSync() {
        throw new Error("fallback should not be used when getDeviceInfo succeeds");
      }
    };
    assert.equal(helper.isDevtoolsPlatform(), false);

    globalThis.wx = {
      getSystemInfoSync() {
        return { platform: "devtools" };
      }
    };
    assert.equal(helper.isDevtoolsPlatform(), true);

    globalThis.wx = {
      getWindowInfo() {
        return {
          statusBarHeight: 47,
          screenHeight: 844,
          windowHeight: 763,
          safeArea: {
            top: 59,
            bottom: 810
          }
        };
      },
      getMenuButtonBoundingClientRect() {
        return {
          top: 59,
          height: 32,
          bottom: 91
        };
      }
    };
    assert.deepEqual(helper.getNavigationSafeArea(), {
      topInset: 59,
      bottomInset: 34,
      menuTop: 59,
      menuHeight: 32,
      menuBottom: 91
    });
  } finally {
    if (typeof originalWx === "undefined") {
      delete globalThis.wx;
    } else {
      globalThis.wx = originalWx;
    }
  }
});
