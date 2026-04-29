import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("room entry sheet exposes a drawer-style nickname-and-consent confirm flow", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "miniprogram/pages/room/room.wxml"),
    "utf8"
  );

  assert.match(source, /确认昵称与协议/);
  assert.match(source, /你的昵称/);
  assert.match(source, /换一个/);
  assert.match(source, /我已阅读并同意/);
  assert.match(source, /bindtap="toggleLegalAgreement"/);
  assert.match(source, /返回大厅/);
  assert.match(source, /暂不进入/);
  assert.match(source, /bindinput="onNicknameChange"/);
  assert.match(source, /bindtap="refreshEntryNickname"/);
  assert.match(source, /maxlength="5"/);
});
