import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roomWxmlPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxml");
const roomWxssPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxss");

test("room page no longer embeds the legacy create or join entry screen", () => {
  const source = fs.readFileSync(roomWxmlPath, "utf8");
  assert.doesNotMatch(source, /class="room-entry-screen"/);
  assert.doesNotMatch(source, />创建 \/ 加入</);
});

test("room shell keeps only a centered room id label with the left menu button", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.doesNotMatch(wxml, /class="room-safe-panel"/);
  assert.match(wxml, /class="room-chrome-btn room-chrome-btn--menu" bindtap="onTapMore"/);
  assert.match(wxml, /class="room-topbar__room/);
  assert.match(wxml, /<text class="room-topbar__room-label">房间号:<\/text>/);
  assert.doesNotMatch(wxml, /class="room-topbar__toggle"/);
  assert.doesNotMatch(wxml, /room-topbar__corner--right/);
  assert.match(wxss, /\.room-topbar__center\s*\{[\s\S]*position:\s*absolute/);
  assert.match(wxss, /\.room-topbar__center\s*\{[\s\S]*left:\s*0/);
  assert.match(wxss, /\.room-topbar__center\s*\{[\s\S]*right:\s*0/);
  assert.match(wxss, /\.room-topbar__center\s*\{[\s\S]*justify-content:\s*center/);
  assert.match(wxss, /\.room-topbar__toggle\s*\{[\s\S]*display:\s*none/);
});

test("room shell gives the left menu button a dedicated hero style", () => {
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(source, /\.room-chrome-btn--menu\s*\{/);
  assert.match(source, /\.room-chrome-btn--menu::after\s*\{/);
  assert.match(source, /\.room-chrome-btn--menu::after\s*\{[\s\S]*linear-gradient/);
});

test("room shell rebalances the playfield to leave a slim bottom gap and a taller header zone", () => {
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(source, /\.room-playfield\s*\{[\s\S]*translateY\(18rpx\)/);
  assert.match(source, /\.room-stage__table\s*\{[\s\S]*top:\s*152rpx/);
  assert.match(source, /\.room-stage__table\s*\{[\s\S]*height:\s*1448rpx/);
});

test("room shell drops the menu button onto the room-id line with a slightly tighter size", () => {
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(source, /\.room-topbar__corner\s*\{[\s\S]*margin-top:\s*48rpx/);
  assert.match(source, /\.room-topbar__corner\s*\{[\s\S]*flex:\s*0 0 84rpx/);
  assert.match(source, /\.room-chrome-btn\s*\{[\s\S]*width:\s*68rpx/);
  assert.match(source, /\.room-chrome-btn\s*\{[\s\S]*height:\s*68rpx/);
});

test("room shell wires dynamic safe-area styles for top and bottom chrome", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /getNavigationSafeArea/);
  assert.match(source, /buildRoomSafeAreaStyles/);
  assert.match(source, /const topbarButtonSize = 68;/);
  assert.match(source, /const roomLabelHeight = 24;/);
  assert.match(source, /bottomInset \+ 72/);
  assert.match(wxml, /class="room-shell" style="\{\{roomShellStyle\}\}"/);
  assert.match(wxml, /class="room-topbar__corner" style="\{\{roomTopbarCornerStyle\}\}"/);
  assert.match(wxml, /class="room-topbar__center" style="\{\{roomTopbarCenterStyle\}\}"/);
  assert.match(wxml, /class="room-shell__bottom-fade" style="\{\{roomBottomFadeStyle\}\}"/);
  assert.match(wxml, /class="room-self" style="\{\{roomSelfStyle\}\}"/);
  assert.match(wxml, /class="call-phase-overlay" style="\{\{callPhaseOverlayStyle\}\}"/);
});

test("room shell removes the old horizontal self-cup shadow slab", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.doesNotMatch(wxml, /class="room-self__dice-shadow"/);
  assert.doesNotMatch(wxss, /\.room-self__dice-shadow\s*\{/);
  assert.doesNotMatch(wxss, /\.room-self__dice-cup\.is-rolling\s+\.room-self__dice-shadow/);
  assert.doesNotMatch(wxss, /@keyframes room-self-shadow-swing/);
});

test("room shell removes the floor shadows under outer cups", () => {
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxss, /\.ghost-cup\s+\.figma-cup__shadow,\s*\.seat-stage-cup\s+\.figma-cup__shadow\s*\{[\s\S]*display:\s*none/);
});

test("room shell uses a more even seven-seat outer ring layout", () => {
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /\{ x: 187\.5, y: 168, bx: 240, by: 180, cupX: 187\.5, cupY: 220, cupAlign: "bottom", slotClass: "slot-top" \}/);
  assert.match(source, /\{ x: 42, y: 290, bx: 84, by: 250, cupX: 100, cupY: 290, cupAlign: "right", slotClass: "slot-upper-left" \}/);
  assert.match(source, /\{ x: 333, y: 290, bx: 291, by: 250, cupX: 275, cupY: 290, cupAlign: "left", slotClass: "slot-upper-right" \}/);
  assert.match(source, /\{ x: 30, y: 420, bx: 78, by: 380, cupX: 96, cupY: 396, cupAlign: "right", slotClass: "slot-mid-left" \}/);
  assert.match(source, /\{ x: 345, y: 420, bx: 297, by: 380, cupX: 279, cupY: 396, cupAlign: "left", slotClass: "slot-mid-right" \}/);
  assert.match(source, /\{ x: 44, y: 556, bx: 92, by: 516, cupX: 110, cupY: 526, cupAlign: "right", slotClass: "slot-lower-left" \}/);
  assert.match(source, /\{ x: 331, y: 556, bx: 283, by: 516, cupX: 265, cupY: 526, cupAlign: "left", slotClass: "slot-lower-right" \}/);
});

test("room page does not rely on external room-view helper at runtime", () => {
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(source, /require\(["']\.\.\/\.\.\/utils\/room-view["']\)/);
});

test("settlement dialog keeps only the bottom continue action", () => {
  const source = fs.readFileSync(roomWxmlPath, "utf8");
  assert.doesNotMatch(source, /sheet-close"\s+bindtap="onSettlementContinue">继续/);
  assert.doesNotMatch(source, />返回</);
});

test("owner start button copy no longer includes the minimum-player hint", () => {
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(source, /开始\(需2人\)/);
});
