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

test("room shell keeps the room id on the same top line while nudging it slightly upward", () => {
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(source, /\.room-topbar__corner\s*\{[\s\S]*margin-top:\s*48rpx/);
  assert.match(source, /\.room-topbar__corner\s*\{[\s\S]*flex:\s*0 0 84rpx/);
  assert.match(source, /\.room-topbar__center\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*46rpx/);
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
  assert.match(source, /const roomLabelTopOffset = Math\.round\(\(topbarButtonSize - roomLabelHeight\) \/ 6\);/);
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

test("room shell no longer renders the shake-to-start guide banner", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.doesNotMatch(wxml, /class="shake-guide"/);
  assert.doesNotMatch(wxml, /摇一摇开始本局/);
  assert.doesNotMatch(wxss, /\.shake-guide\s*\{/);
  assert.doesNotMatch(wxss, /\.shake-guide__text\s*\{/);
});

test("room self area renders a matching call bubble for the local player", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxml, /wx:if="\{\{item\.isSelf && item\.callText\}\}" class="room-self__bubble seat__bubble(?:\s+\{\{item\.bubbleClass\}\})?"/);
  assert.match(wxml, /class="room-self__bubble-count seat__bubble-count">\{\{item\.callCount\}\}<\/text>/);
  assert.match(wxml, /class="room-self__bubble-die seat__bubble-die" src="\{\{item\.callPointAsset\}\}"/);
  assert.match(wxss, /\.room-self__bubble\s*\{[\s\S]*right:\s*-217rpx/);
  assert.match(wxss, /\.room-self__bubble\s*\{[\s\S]*bottom:\s*146rpx/);
  assert.match(wxss, /\.room-self__bubble\s*\{[\s\S]*right:\s*-198rpx/);
  assert.match(wxss, /\.room-self__bubble\s*\{[\s\S]*bottom:\s*166rpx/);
});

test("room shell removes the floor shadows under outer cups", () => {
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxss, /\.ghost-cup\s+\.figma-cup__shadow,\s*\.seat-stage-cup\s+\.figma-cup__shadow\s*\{[\s\S]*display:\s*none/);
});

test("room shell uses a more even seven-seat outer ring layout", () => {
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /\{ x: 187\.5, y: 168, bx: 240, by: 180, cupX: 187\.5, cupY: 220, cupAlign: "bottom", slotClass: "slot-top" \}/);
  assert.match(source, /\{ x: 42, y: 290, bx: 84, by: 250, cupX: 102, cupY: 290, cupAlign: "right", slotClass: "slot-upper-left" \}/);
  assert.match(source, /\{ x: 333, y: 290, bx: 291, by: 250, cupX: 273, cupY: 290, cupAlign: "left", slotClass: "slot-upper-right" \}/);
  assert.match(source, /\{ x: 30, y: 420, bx: 78, by: 380, cupX: 102, cupY: 396, cupAlign: "right", slotClass: "slot-mid-left" \}/);
  assert.match(source, /\{ x: 345, y: 420, bx: 297, by: 380, cupX: 273, cupY: 396, cupAlign: "left", slotClass: "slot-mid-right" \}/);
  assert.match(source, /\{ x: 44, y: 556, bx: 92, by: 516, cupX: 102, cupY: 526, cupAlign: "right", slotClass: "slot-lower-left" \}/);
  assert.match(source, /\{ x: 331, y: 556, bx: 283, by: 516, cupX: 273, cupY: 526, cupAlign: "left", slotClass: "slot-lower-right" \}/);
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
  assert.match(source, /wx:if="\{\{settlementCanContinue\}\}" class="sheet-actions"/);
});

test("seating dialog reuses the settlement sheet skin", () => {
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(source, /\.room-sheet--seating\s*\{/);
  assert.match(
    source,
    /\.room-sheet--seating\s*\{[\s\S]*background:\s*linear-gradient\(180deg,\s*rgba\(45,\s*39,\s*59,\s*0\.96\)\s*0%,\s*rgba\(29,\s*24,\s*40,\s*0\.96\)\s*100%\)/
  );
});

test("seating dialog uses a compact 2-column seat card grid", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxml, /class="seat-grid__head"/);
  assert.match(wxml, /wx:if="\{\{item\.actionText\}\}" class="seat-grid__action"/);
  assert.doesNotMatch(wxml, /class="seat-grid__row"/);
  assert.match(wxss, /\.seat-grid\s*\{[\s\S]*display:\s*grid/);
  assert.match(wxss, /\.seat-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(wxss, /\.seat-grid__item\s*\{[\s\S]*min-height:\s*148rpx/);
  assert.match(wxss, /\.seat-grid__item\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(wxss, /\.seat-grid__head\s*\{[\s\S]*justify-content:\s*space-between/);
});

test("room self dice render above the glass layer for crisp visibility", () => {
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(source, /\.room-self__dice-pile\s*\{[\s\S]*z-index:\s*4/);
  assert.match(source, /\.room-self__dice-stack\s*\{[\s\S]*z-index:\s*4/);
  assert.match(source, /\.room-self__dice-glass\s*\{[\s\S]*z-index:\s*1/);
});

test("room self glass stays subtle so the dice do not look foggy", () => {
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(source, /\.room-self__dice-glass\s*\{[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.09\)/);
  assert.match(source, /\.room-self__dice-glass\s*\{[\s\S]*rgba\(0,\s*0,\s*0,\s*0\.1\)/);
  assert.match(source, /\.room-self__dice-cup\.has-dice\s+\.room-self__dice-glass\s*\{[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.12\)/);
  assert.match(source, /\.room-self__dice-cup\.has-dice\s+\.room-self__dice-glass\s*\{[\s\S]*rgba\(0,\s*0,\s*0,\s*0\.26\)/);
});

test("room self rolling animation uses staged motion, reveal sequencing, and dedicated die slots", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(
    wxml,
    /class="room-self__die-slot room-self__die-slot--\{\{index\}\} \{\{item\.motionClass\}\} \{\{item\.revealed \? 'is-revealed' : 'is-pending'\}\}"/
  );
  assert.match(
    wxml,
    /class="room-self__die \{\{item\.revealed \? 'is-revealed' : 'is-pending'\}\}"/
  );
  assert.match(wxss, /\.room-self__die-slot\s*\{/);
  assert.match(wxss, /\.room-self__die-slot\.motion-0 \.room-self__die\s*\{[\s\S]*animation-delay:\s*0ms;[\s\S]*animation-duration:\s*206ms;/);
  assert.match(wxss, /\.room-self__dice-cup\.is-rolling\s*\{[\s\S]*animation:\s*room-self-cup-rock 220ms cubic-bezier\(0\.36,\s*0\.02,\s*0\.22,\s*1\) infinite/);
  assert.match(wxss, /\.room-self__dice-cup\.is-rolling \.room-self__dice-stack\s*\{[\s\S]*animation:\s*room-self-stack-shift 170ms cubic-bezier\(0\.39,\s*0,\s*0\.24,\s*1\) infinite/);
  assert.match(wxss, /\.room-self__dice-cup\.is-rolling \.room-self__die\.is-pending\s*\{[\s\S]*animation-name:\s*room-self-die-spin;[\s\S]*animation-timing-function:\s*cubic-bezier\(0\.38,\s*0,\s*0\.24,\s*1\);[\s\S]*animation-iteration-count:\s*infinite;/);
  assert.match(wxss, /\.room-self__dice-cup\.is-revealing\s*\{[\s\S]*animation:\s*room-self-cup-settle 340ms ease-out 1;/);
  assert.match(wxss, /\.room-self__dice-cup\.is-revealing \.room-self__die\.is-pending\s*\{[\s\S]*animation-name:\s*room-self-die-spin-reveal;[\s\S]*animation-timing-function:\s*cubic-bezier\(0\.36,\s*0,\s*0\.22,\s*1\);[\s\S]*animation-iteration-count:\s*infinite;/);
  assert.match(wxss, /\.room-self__dice-cup\.is-revealing \.room-self__die-slot\.is-revealed\s*\{[\s\S]*opacity:\s*1;/);
  assert.match(wxss, /\.room-self__dice-cup\.is-revealing \.room-self__die-slot\.is-pending\s*\{[\s\S]*opacity:\s*0\.96;/);
  assert.match(wxss, /@keyframes room-self-cup-rock\s*\{[\s\S]*25%\s*\{[\s\S]*rotate\(-16deg\)/);
  assert.match(wxss, /@keyframes room-self-cup-settle\s*\{[\s\S]*0%\s*\{[\s\S]*translate\(12rpx,\s*16rpx\) rotate\(-7deg\)/);
  assert.match(wxss, /@keyframes room-self-stack-shift\s*\{[\s\S]*35%\s*\{[\s\S]*translate\(18rpx,\s*-6rpx\) scale\(1\.05\)/);
  assert.match(wxss, /@keyframes room-self-die-spin\s*\{[\s\S]*rotate\(-26deg\) scale\(0\.86\)/);
  assert.match(wxss, /@keyframes room-self-die-spin-reveal\s*\{[\s\S]*30%\s*\{[\s\S]*rotate\(94deg\) scale\(1\.02\)/);
  assert.match(wxss, /@keyframes room-self-die-spin\s*\{[\s\S]*75%\s*\{[\s\S]*rotate\(332deg\) scale\(1\.08\)/);
  assert.match(wxss, /@keyframes room-self-die-spin\s*\{[\s\S]*100%\s*\{[\s\S]*rotate\(418deg\) scale\(0\.94\)/);
  assert.match(wxss, /@keyframes room-self-die-settle\s*\{[\s\S]*transform:\s*translateY\(16rpx\) scale\(0\.88\)/);
  assert.match(source, /const ROOM_SELF_ROLLING_FRAME_MS = 90;/);
  assert.match(source, /const ROOM_SELF_ROLLING_DURATION_MS = 1152;/);
  assert.match(source, /const ROOM_SELF_REVEAL_STAGGER_MS = 84;/);
  assert.match(source, /const ROOM_SELF_REVEAL_SETTLE_MS = 1200;/);
  assert.match(source, /const ROOM_SELF_REVEAL_ORDER = \[1,\s*3,\s*0,\s*4,\s*2,\s*5,\s*6,\s*7,\s*8,\s*9\];/);
});

test("room table watermark keeps the Chinese and English labels on two separate lines", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxml, /class="room-stage__watermark"/);
  assert.match(wxml, /class="room-stage__watermark-cn">吹牛</);
  assert.match(wxml, /class="room-stage__watermark-en">LIAR'S DICE</);
  assert.match(wxss, /\.room-stage__watermark\s*\{[\s\S]*display:\s*flex/);
  assert.match(wxss, /\.room-stage__watermark\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(wxss, /\.room-stage__watermark-en\s*\{[^}]*position:\s*static/);
});

test("owner start button copy no longer includes the minimum-player hint", () => {
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(source, /开始\(需2人\)/);
});
