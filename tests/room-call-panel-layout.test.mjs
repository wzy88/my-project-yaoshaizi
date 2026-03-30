import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roomWxmlPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxml");
const roomJsPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");

test("room call panel switches between count and point selectors", () => {
  const roomWxml = fs.readFileSync(roomWxmlPath, "utf8");
  const roomJs = fs.readFileSync(roomJsPath, "utf8");

  assert.match(roomWxml, /wx:if="\{\{callSelectorMode !== 'point'\}\}" class="call-phase-panel__counts"/);
  assert.match(roomWxml, /wx:if="\{\{callSelectorMode === 'point'\}\}" class="call-phase-panel__points"/);
  assert.match(roomWxml, /class="call-phase-panel__value-box" data-mode="count" bindtap="toggleCallSelectorMode"/);
  assert.match(roomWxml, /class="call-phase-panel__point-box \{\{callForcedOpen \? 'is-disabled' : ''\}\}" data-mode="point" bindtap="toggleCallSelectorMode"/);
  assert.match(roomWxml, /bindtap="onSelectCallPointOption"/);
  assert.doesNotMatch(roomWxml, /bindtap="onTapCallPointPicker"/);
  assert.doesNotMatch(roomJs, /showActionSheetSafe\(\{\s*itemList:\s*\["1点", "2点", "3点", "4点", "5点", "6点"\]/);
  assert.match(roomJs, /callSelectorMode: isMyCallingTurn \? \(this\.data\.callSelectorMode \|\| "count"\) : ""/);
});

test("room call panel opens manually during calling and supports overlay close", () => {
  const roomWxml = fs.readFileSync(roomWxmlPath, "utf8");
  const roomJs = fs.readFileSync(roomJsPath, "utf8");

  assert.match(roomWxml, /<view wx:if="\{\{callPanelVisible\}\}" class="call-phase-overlay" bindtap="closeCallPanel">/);
  assert.match(roomWxml, /<view class="call-phase-panel" catchtap="noop">/);
  assert.match(roomJs, /const callPanelVisible = isMyCallingTurn \? Boolean\(this\.data\.callPanelVisible\) : false;/);
  assert.doesNotMatch(roomJs, /const callPanelVisible = isMyCallingTurn;/);
  assert.match(roomJs, /primaryActionText = callForcedOpen \? "开牌" : "叫牌";/);
  assert.match(roomJs, /if \(!forcedOpen\) \{\s*this\.openCallPanel\(\);\s*return;\s*\}/);
});
