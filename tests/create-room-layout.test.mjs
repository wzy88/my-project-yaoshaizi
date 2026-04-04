import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const createRoomWxmlPath = path.join(process.cwd(), "miniprogram/pages/create-room/create-room.wxml");
const createRoomWxssPath = path.join(process.cwd(), "miniprogram/pages/create-room/create-room.wxss");
const createRoomScriptPath = path.join(process.cwd(), "miniprogram/pages/create-room/create-room.js");

test("create room page keeps player count, spectator, and room lock controls disabled with product defaults", () => {
  const wxml = fs.readFileSync(createRoomWxmlPath, "utf8");
  const wxss = fs.readFileSync(createRoomWxssPath, "utf8");
  const script = fs.readFileSync(createRoomScriptPath, "utf8");

  assert.match(script, /playerCount:\s*8/);
  assert.match(script, /allowSpectator:\s*false/);
  assert.match(script, /lockRoom:\s*false/);

  assert.match(wxml, /class="chip \{\{playerCount === item \? 'active' : ''\}\} is-disabled"/);
  assert.doesNotMatch(wxml, /bindtap="onSelectPlayerCount"/);

  assert.match(wxml, /class="toggle-card is-disabled"/);
  assert.doesNotMatch(wxml, /data-field="allowSpectator" bindtap="onToggleField"/);
  assert.doesNotMatch(wxml, /data-field="lockRoom" bindtap="onToggleField"/);

  assert.match(wxss, /\.chip\.is-disabled\s*\{/);
  assert.match(wxss, /\.toggle-card\.is-disabled\s*\{/);
  assert.match(wxss, /\.toggle-pill\.is-disabled\s*\{/);
});
