import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("room entry sheet exposes a lightweight nickname-and-consent confirm flow", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "miniprogram/pages/room/room.wxml"),
    "utf8"
  );

  assert.match(source, /开始前确认一下/);
  assert.match(source, /你的昵称/);
  assert.match(source, /换一个/);
  assert.match(source, /点击继续即表示同意/);
  assert.match(source, /bindinput="onNicknameChange"/);
  assert.match(source, /bindtap="refreshEntryNickname"/);
});
