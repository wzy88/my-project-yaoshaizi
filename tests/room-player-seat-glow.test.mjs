import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roomWxmlPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxml");
const roomJsPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");

test("room player seat does not render glow overlay", () => {
  const roomWxml = fs.readFileSync(roomWxmlPath, "utf8");
  const roomJs = fs.readFileSync(roomJsPath, "utf8");

  assert.doesNotMatch(roomWxml, /class="seat__glow/);
  assert.doesNotMatch(roomJs, /const showGlow = /);
  assert.doesNotMatch(roomJs, /showGlow,/);
});
