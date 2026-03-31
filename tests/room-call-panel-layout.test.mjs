import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roomWxmlPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxml");
const roomJsPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
const roomWxssPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxss");

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
  const roomWxss = fs.readFileSync(roomWxssPath, "utf8");

  assert.match(roomWxml, /<view wx:if="\{\{callPanelVisible\}\}" class="call-phase-overlay"( style="\{\{callPhaseOverlayStyle\}\}")? bindtap="closeCallPanel">/);
  assert.match(roomWxml, /<view class="call-phase-panel" catchtap="noop">/);
  assert.match(roomJs, /const callPanelVisible = isMyCallingTurn \? Boolean\(this\.data\.callPanelVisible\) : false;/);
  assert.doesNotMatch(roomJs, /const callPanelVisible = isMyCallingTurn;/);
  assert.match(roomJs, /primaryActionText = callForcedOpen \? "开牌" : "叫牌";/);
  assert.match(roomJs, /if \(!forcedOpen\) \{\s*this\.openCallPanel\(\);\s*return;\s*\}/);
  assert.match(roomWxss, /\.call-phase-overlay\s*\{[\s\S]*top:\s*0/);
  assert.match(roomWxss, /\.call-phase-overlay\s*\{[\s\S]*display:\s*flex/);
  assert.match(roomWxss, /\.call-phase-overlay\s*\{[\s\S]*align-items:\s*flex-end/);
});

test("room call panel stays content-sized instead of reserving an empty lower half", () => {
  const roomWxss = fs.readFileSync(roomWxssPath, "utf8");

  assert.doesNotMatch(roomWxss, /\.call-phase-panel\s*\{[\s\S]*min-height:\s*560rpx/);
  assert.match(roomWxss, /\.call-phase-panel\s*\{[\s\S]*padding:\s*24rpx 24rpx 28rpx/);
});
