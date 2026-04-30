import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import {
  getRoomThemeManifest,
  listRoomThemeManifests
} from "../apps/server/dist/engine/room-theme-catalog.js";

const require = createRequire(import.meta.url);
const {
  buildLocalRoomThemeManifest,
  loadRoomThemeManifest,
  normalizeRoomThemeManifest,
  registerRoomThemeManifest
} = require("../miniprogram/utils/room-theme-loader.js");
const {
  normalizeRoomThemeId: normalizeMiniappRoomThemeId,
  parseRoomThemeId
} = require("../miniprogram/utils/room-themes.js");
const { getRoomThemeAssets } = require("../miniprogram/utils/room-theme-assets.js");
const { getSelfDieAsset } = require("../miniprogram/utils/dice-assets.js");

test("server room theme catalog exposes a complete manifest for remote loading", () => {
  const manifest = getRoomThemeManifest("ruby-red");

  assert.equal(manifest.id, "ruby-red");
  assert.equal(manifest.label, "玄曜");
  assert.match(manifest.version, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
  assert.equal(manifest.className, "room-theme-ruby-red");
  assert.equal(manifest.assets.pageBackgroundSrc, "/pages/room/assets/room-themes/ruby-red-bg-black.jpg");
  assert.equal(manifest.assets.primaryButtonClass, "room-fab--ruby-slice");
  assert.equal(manifest.assets.dice["3"], "/pages/room/assets/room-themes/ruby-red-die-face-3.svg");
  assert.ok(manifest.criticalAssets.includes(manifest.assets.pageBackgroundSrc));
  assert.deepEqual(manifest.loading.steps.slice(0, 2), ["同步主题配置", "加载桌面资源"]);

  const all = listRoomThemeManifests();
  assert.equal(all.length, 4);
  assert.ok(all.every((item) => item.assets.dice["6"]));
});

test("room theme aliases normalize black, white, and red before falling back to green", () => {
  const aliases = [
    ["black", "ruby-red"],
    ["黑", "ruby-red"],
    ["玄曜", "ruby-red"],
    ["white", "glacier-blue"],
    ["白", "glacier-blue"],
    ["霁雪", "glacier-blue"],
    ["red", "imperial-red"],
    ["红", "imperial-red"],
    ["绛华", "imperial-red"]
  ];

  assert.equal(getRoomThemeManifest("black").id, "ruby-red");
  assert.equal(getRoomThemeManifest("white").id, "glacier-blue");
  assert.equal(getRoomThemeManifest("red").id, "imperial-red");
  assert.equal(normalizeMiniappRoomThemeId("black"), "ruby-red");
  assert.equal(normalizeMiniappRoomThemeId("white"), "glacier-blue");
  assert.equal(normalizeMiniappRoomThemeId("red"), "imperial-red");

  for (const [raw, expected] of aliases) {
    assert.equal(parseRoomThemeId(raw), expected);
  }

  assert.equal(parseRoomThemeId("unknown-theme"), "");
  assert.equal(normalizeMiniappRoomThemeId("unknown-theme"), "jade-green");
});

test("miniapp theme loader can register server-provided assets over bundled fallback", () => {
  const local = buildLocalRoomThemeManifest("glacier-blue");
  const manifest = normalizeRoomThemeManifest({
    id: "glacier-blue",
    version: "remote-test",
    label: "霁雪",
    assets: {
      pageBackgroundSrc: "https://cdn.example.com/themes/glacier-blue/bg.webp",
      primaryButtonClass: "room-fab--glacier-slice",
      dice: {
        3: "https://cdn.example.com/themes/glacier-blue/die-3.svg"
      }
    },
    loading: {
      title: "正在布置「霁雪」房间",
      steps: ["同步主题配置", "加载桌面资源", "进入房间"]
    }
  }, "glacier-blue");

  registerRoomThemeManifest(manifest);

  assert.equal(getRoomThemeAssets("glacier-blue").pageBackgroundSrc, "https://cdn.example.com/themes/glacier-blue/bg.webp");
  assert.equal(getRoomThemeAssets("glacier-blue").tableclothSrc, local.assets.tableclothSrc);
  assert.equal(getSelfDieAsset(3, "glacier-blue"), "https://cdn.example.com/themes/glacier-blue/die-3.svg");
  assert.equal(getSelfDieAsset(4, "glacier-blue"), local.assets.dice["4"]);
});

test("miniapp theme loader rejects green fallback manifests for every selected premium theme", async () => {
  const originalWx = globalThis.wx;
  const originalGetApp = globalThis.getApp;
  const storage = {};
  let requestedThemeId = "ruby-red";

  globalThis.getApp = () => ({
    globalData: {
      wsUrl: "ws://example.test/ws"
    }
  });
  globalThis.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : "";
    },
    setStorageSync(key, value) {
      storage[key] = value;
    },
    request(options) {
      assert.equal(options.data.themeId, requestedThemeId);
      options.success({
        statusCode: 200,
        data: {
          manifest: getRoomThemeManifest("jade-green")
        }
      });
    }
  };

  try {
    const themeExpectations = [
      ["ruby-red", "room-theme-ruby-red"],
      ["imperial-red", "room-theme-imperial-red"],
      ["glacier-blue", "room-theme-glacier-blue"]
    ];

    for (const [themeId, className] of themeExpectations) {
      requestedThemeId = themeId;
      const manifest = await loadRoomThemeManifest(themeId, {
        preferRemote: true,
        downloadAssets: false
      });

      assert.equal(manifest.id, themeId);
      assert.equal(manifest.className, className);
    }
  } finally {
    globalThis.wx = originalWx;
    globalThis.getApp = originalGetApp;
  }
});
