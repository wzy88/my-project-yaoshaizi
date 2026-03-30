import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roomWxmlPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxml");
const roomJsPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");

test("room call signals stay on seats and the self hint lives in the bottom area", () => {
  const roomWxml = fs.readFileSync(roomWxmlPath, "utf8");
  const roomJs = fs.readFileSync(roomJsPath, "utf8");

  assert.doesNotMatch(roomWxml, /class="table-call"/);
  assert.match(roomWxml, /wx:if="\{\{selfCallHint\}\}" class="room-self-call-hint room-self-call-hint--floating"/);
  assert.match(roomWxml, /wx:if="\{\{selfCallHint\}\}" class="room-self-call-hint room-self-call-hint--inline"/);
  assert.match(roomJs, /const selfCallHint = self && self\.currentCall \? `上一手：\$\{self\.currentCall\.count\}个\$\{self\.currentCall\.point\}` : "";/);
});
