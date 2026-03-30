import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roomWxmlPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxml");

test("room entry uses a dedicated full-page container instead of only a modal mask", () => {
  const source = fs.readFileSync(roomWxmlPath, "utf8");
  assert.match(source, /wx:if="\{\{showJoinPanel\}\}"\s+class="room-entry-screen"/);
});
