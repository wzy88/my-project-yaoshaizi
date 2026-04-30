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
  normalizeRoomThemeManifest,
  registerRoomThemeManifest
} = require("../miniprogram/utils/room-theme-loader.js");
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
