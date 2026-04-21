import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const createRoomWxmlPath = path.join(process.cwd(), "miniprogram/pages/create-room/create-room.wxml");
const createRoomWxssPath = path.join(process.cwd(), "miniprogram/pages/create-room/create-room.wxss");
const createRoomScriptPath = path.join(process.cwd(), "miniprogram/pages/create-room/create-room.js");

test("create room page keeps only the fixed 8-seat room summary plus live config options", () => {
  const wxml = fs.readFileSync(createRoomWxmlPath, "utf8");
  const wxss = fs.readFileSync(createRoomWxssPath, "utf8");
  const script = fs.readFileSync(createRoomScriptPath, "utf8");

  assert.match(script, /playerCount:\s*8/);
  assert.doesNotMatch(script, /playerCountOptions/);
  assert.doesNotMatch(script, /allowSpectator/);
  assert.doesNotMatch(script, /lockRoom/);

  assert.match(wxml, /<text class="block-title">房间形式<\/text>/);
  assert.match(wxml, /class="room-form-card"/);
  assert.match(wxml, /class="room-form-card__badge">固定房间<\/view>/);
  assert.match(wxml, /class="room-form-card__title">固定 8 个座位<\/text>/);
  assert.match(wxml, /房间始终保留 8 个座位，来几个人算几个人，最多 8 人同局。/);
  assert.doesNotMatch(wxml, /允许旁观/);
  assert.doesNotMatch(wxml, /锁定房间/);
  assert.doesNotMatch(wxml, /测试模式/);
  assert.doesNotMatch(wxml, /wx:if="\{\{devtoolsMode\}\}"/);
  assert.doesNotMatch(script, /\btestMode:\s*false/);
  assert.doesNotMatch(script, /\bdevtoolsMode:\s*false/);
  assert.doesNotMatch(script, /isDevtoolsPlatform/);
  assert.match(script, /&testMode=0/);
  assert.doesNotMatch(script, /playerCount=\$\{/);
  assert.doesNotMatch(script, /allowSpectator=/);
  assert.doesNotMatch(script, /lockRoom=/);

  assert.match(wxss, /\.room-form-card\s*\{/);
  assert.match(wxss, /\.room-form-card__title\s*\{/);
  assert.match(wxss, /\.room-form-card__desc\s*\{/);
});
