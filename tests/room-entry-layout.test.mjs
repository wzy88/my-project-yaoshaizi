import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roomWxmlPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxml");
const roomWxssPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxss");
const roomJsonPath = path.join(process.cwd(), "miniprogram/pages/room/room.json");

test("room page no longer embeds the legacy create or join entry screen", () => {
  const source = fs.readFileSync(roomWxmlPath, "utf8");
  assert.doesNotMatch(source, /class="room-entry-screen"/);
  assert.doesNotMatch(source, />创建 \/ 加入</);
});

test("room page disables page-level scrolling while leaving internal panels to manage their own scroll", () => {
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  const json = JSON.parse(fs.readFileSync(roomJsonPath, "utf8"));
  assert.equal(json.disableScroll, true);
  assert.match(wxss, /page\s*\{[\s\S]*height:\s*100%[\s\S]*overflow:\s*hidden/);
  assert.match(wxss, /\.page\s*\{[\s\S]*height:\s*100%/);
  assert.match(wxss, /\.page\s*\{[\s\S]*min-height:\s*100%/);
  assert.match(wxss, /\.page\.room-screen\s+\.room-shell\s*\{[\s\S]*height:\s*100%/);
  assert.match(wxss, /\.page\.room-screen\s+\.room-shell\s*\{[\s\S]*overflow:\s*hidden/);
});

test("room shell keeps the room id centered while moving share into the left-top menu", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.doesNotMatch(wxml, /class="room-safe-panel"/);
  assert.match(wxml, /class="room-chrome-btn room-chrome-btn--menu" bindtap="onTapMore"/);
  assert.match(wxml, /class="room-topbar-menu-popover"/);
  assert.match(wxml, /class="room-topbar-menu-popover__item room-topbar-menu-popover__item--share" open-type="share" bindtap="onTapMenuShare"/);
  assert.match(wxml, /class="room-topbar-menu-popover__text">邀请好友<\/text>/);
  assert.match(wxml, /class="room-topbar-menu-popover__text">音效开关<\/text>/);
  assert.doesNotMatch(wxml, /class="room-topbar-menu-popover__text">设置<\/text>/);
  assert.match(wxml, /class="room-topbar__room/);
  assert.match(wxml, /<text class="room-topbar__room-label">房间号:<\/text>/);
  assert.doesNotMatch(wxml, /class="room-topbar__toggle"/);
  assert.doesNotMatch(wxml, /class="room-topbar__corner room-topbar__corner--right"/);
  assert.doesNotMatch(wxml, /class="room-self__share-btn"/);
  assert.match(wxss, /\.room-topbar__center\s*\{[\s\S]*position:\s*absolute/);
  assert.match(wxss, /\.room-topbar__center\s*\{[\s\S]*left:\s*0/);
  assert.match(wxss, /\.room-topbar__center\s*\{[\s\S]*right:\s*0/);
  assert.match(wxss, /\.room-topbar__center\s*\{[\s\S]*justify-content:\s*center/);
  assert.match(wxss, /\.room-topbar__toggle\s*\{[\s\S]*display:\s*none/);
  assert.match(wxss, /\.room-topbar-menu-popover\s*\{/);
  assert.match(wxss, /\.room-topbar-menu-popover__item--share\s*\{/);
  assert.match(wxss, /\.room-topbar-menu-popover__text\s*\{/);
});

test("room shell supports experimental room theme classes without changing the default skin", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const script = fs.readFileSync(scriptPath, "utf8");

  assert.match(wxml, /room-phase-\{\{phase\}\} \{\{roomThemeClass\}\}/);
  assert.match(script, /roomThemeId:\s*DEFAULT_ROOM_THEME_ID/);
  assert.match(script, /roomThemeClass:\s*buildRoomThemeClass\(DEFAULT_ROOM_THEME_ID\)/);
  assert.match(script, /themeId:\s*normalizeRoomThemeId\(this\.data\.createRoomThemeId\)/);
  assert.match(script, /const incomingThemeId = roomConfig && roomConfig\.themeId/);
  assert.match(script, /normalizeRoomThemeId\(this\.data\.createRoomThemeId \|\| this\.data\.roomThemeId\)/);
  assert.match(wxss, /\.page\.room-theme-ruby-red \.room-stage__table-frame\s*\{/);
  assert.match(wxss, /\.page\.room-theme-sapphire-blue \.room-stage__table-frame\s*\{/);
  assert.match(wxss, /\.page\.room-theme-ruby-red \.seat__bubble\s*\{/);
  assert.match(wxss, /\.page\.room-theme-sapphire-blue \.room-fab\s*\{/);
});

test("room shell renders an in-room custom settings sheet instead of a native-looking menu", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");

  assert.match(wxml, /wx:if="\{\{toolsBasicVisible\}\}" class="room-mask room-mask--settings"/);
  assert.match(wxml, /class="room-sheet room-sheet--settings"/);
  assert.match(wxml, /class="settings-row" bindtap="onToggleRoomTurnAlertSfx"/);
  assert.match(wxml, /class="settings-row__label">叫牌提醒<\/text>/);
  assert.match(wxss, /\.room-sheet--settings\s*\{/);
  assert.match(wxss, /\.settings-panel\s*\{/);
  assert.match(wxss, /\.settings-row__badge\.is-on\s*\{/);
});

test("room shell gives the left menu button a dedicated hero style", () => {
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(source, /\.room-chrome-btn--menu\s*\{/);
  assert.match(source, /\.room-chrome-btn--menu::after\s*\{/);
  assert.match(source, /\.room-chrome-btn--menu::after\s*\{[\s\S]*display:\s*none/);
  assert.doesNotMatch(source, /\.room-chrome-btn--menu\s*\{[\s\S]*0 0 0 2rpx rgba\(255, 226, 116/);
});

test("room shell lifts the playfield and removes the heavy bottom mask", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxml, /class="room-playfield" style="\{\{roomPlayfieldStyle\}\}"/);
  assert.match(source, /\.room-playfield\s*\{[\s\S]*translateY\(-48rpx\)/);
  assert.match(source, /\.room-playfield\s*\{[\s\S]*transform-origin:\s*top center/);
  assert.match(source, /\.room-stage__table\s*\{[\s\S]*top:\s*152rpx/);
  assert.match(source, /\.room-stage__table\s*\{[\s\S]*height:\s*1448rpx/);
  assert.match(source, /\.room-shell__bottom-fade\s*\{[\s\S]*background:\s*none/);
  assert.match(source, /\.room-shell__bottom-fade\s*\{[\s\S]*pointer-events:\s*none/);
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
  assert.match(source, /bottomInset \+ 46/);
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

test("room bubbles now use one shared compact size across every seat direction", () => {
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxss, /\.seat__bubble\s*\{[\s\S]*min-width:\s*100rpx[\s\S]*height:\s*56rpx[\s\S]*padding:\s*0 10rpx[\s\S]*border-radius:\s*19rpx/);
  assert.match(wxss, /\.room-self__bubble\s*\{[\s\S]*min-width:\s*100rpx[\s\S]*height:\s*56rpx[\s\S]*padding:\s*0 10rpx[\s\S]*border-radius:\s*19rpx/);
  assert.doesNotMatch(wxss, /\.seat__bubble--slot-upper-left,\s*\.seat__bubble--slot-mid-left,\s*\.seat__bubble--slot-lower-left,\s*\.seat__bubble--slot-upper-right,\s*\.seat__bubble--slot-mid-right,\s*\.seat__bubble--slot-lower-right\s*\{/);
});

test("room player names stay on one line and the self identity sits below the cup", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxml, /class="seat__name \{\{item\.nicknameLengthClass\}\}">\{\{item\.nicknameShort\}\}<\/text>/);
  assert.match(wxss, /\.seat__name\s*\{[\s\S]*max-width:\s*176rpx[\s\S]*white-space:\s*nowrap[\s\S]*font-size:\s*22rpx/);
  assert.match(wxss, /\.seat__name\.is-long\s*\{[\s\S]*font-size:\s*20rpx/);
  assert.match(wxss, /\.seat__name\.is-extra-long\s*\{[\s\S]*font-size:\s*18rpx/);
  assert.match(wxss, /\.room-self__identity\s*\{[\s\S]*margin-top:\s*40rpx/);
  assert.match(wxss, /\.room-self__name\s*\{[\s\S]*white-space:\s*nowrap/);
});

test("room entry and settlement names enforce the five-character single-line rule", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");

  assert.match(wxml, /class="join-input"[\s\S]*maxlength="5"/);
  assert.match(wxml, /class="settlement-name \{\{item\.nameLengthClass\}\}">\{\{item\.name\}\}<\/text>/);
  assert.match(wxss, /\.settlement-name\s*\{[\s\S]*max-width:\s*132rpx[\s\S]*white-space:\s*nowrap/);
  assert.match(wxss, /\.settlement-name\.is-long\s*\{[\s\S]*font-size:\s*21rpx/);
  assert.match(wxss, /\.settlement-name\.is-extra-long\s*\{[\s\S]*font-size:\s*18rpx/);
});

test("room bubble tails use the softer rounded pointer treatment", () => {
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxss, /\.seat__bubble::after\s*\{[\s\S]*width:\s*16rpx[\s\S]*height:\s*16rpx[\s\S]*border-radius:\s*50%/);
  assert.match(wxss, /\.seat__bubble--slot-upper-left::after,[\s\S]*left:\s*14rpx[\s\S]*bottom:\s*-8rpx[\s\S]*transform:\s*none/);
  assert.match(wxss, /\.seat__bubble--slot-upper-right::after,[\s\S]*right:\s*-8rpx[\s\S]*top:\s*50%[\s\S]*transform:\s*translateY\(-50%\)/);
});

test("room shell removes the floor shadows under outer cups", () => {
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxss, /\.ghost-cup\s+\.figma-cup__shadow,\s*\.seat-stage-cup\s+\.figma-cup__shadow\s*\{[\s\S]*display:\s*none/);
});

test("room shell uses a more even seven-seat outer ring layout", () => {
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /\{ x: 187\.5, y: 168, bx: 248, by: 165, cupX: 187\.5, cupY: 220, cupAlign: "bottom", slotClass: "slot-top" \}/);
  assert.match(source, /\{ x: 42, y: 290, bx: 144, by: 250, cupX: 102, cupY: 290, cupAlign: "right", slotClass: "slot-upper-left" \}/);
  assert.match(source, /\{ x: 333, y: 290, bx: 231, by: 250, cupX: 273, cupY: 290, cupAlign: "left", slotClass: "slot-upper-right" \}/);
  assert.match(source, /\{ x: 42, y: 396, bx: 144, by: 356, cupX: 102, cupY: 396, cupAlign: "right", slotClass: "slot-mid-left" \}/);
  assert.match(source, /\{ x: 333, y: 396, bx: 231, by: 356, cupX: 273, cupY: 396, cupAlign: "left", slotClass: "slot-mid-right" \}/);
  assert.match(source, /\{ x: 42, y: 526, bx: 144, by: 486, cupX: 102, cupY: 526, cupAlign: "right", slotClass: "slot-lower-left" \}/);
  assert.match(source, /\{ x: 333, y: 526, bx: 231, by: 486, cupX: 273, cupY: 526, cupAlign: "left", slotClass: "slot-lower-right" \}/);
});

test("side seats pull the avatar group inward and scale it below the top and bottom seats", () => {
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(source, /\.seat--slot-upper-left,\s*\.seat--slot-mid-left,\s*\.seat--slot-lower-left\s*\{[\s\S]*margin-left:\s*20rpx/);
  assert.match(source, /\.seat--slot-upper-right,\s*\.seat--slot-mid-right,\s*\.seat--slot-lower-right\s*\{[\s\S]*margin-left:\s*-20rpx/);
  assert.match(source, /\.seat--slot-upper-left \.seat__avatar-shell,[\s\S]*\.seat--slot-lower-right \.seat__avatar-shell\s*\{[\s\S]*width:\s*70rpx[\s\S]*height:\s*70rpx/);
  assert.match(source, /\.seat--slot-upper-left \.seat__avatar,[\s\S]*\.seat--slot-lower-right \.seat__avatar\s*\{[\s\S]*width:\s*58rpx[\s\S]*height:\s*58rpx/);
});

test("room page does not rely on external room-view helper at runtime", () => {
  const scriptPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.doesNotMatch(source, /require\(["']\.\.\/\.\.\/utils\/room-view["']\)/);
});

test("settlement dialog keeps only the bottom continue action", () => {
  const source = fs.readFileSync(roomWxmlPath, "utf8");
  assert.doesNotMatch(source, /sheet-close"\s+bindtap="onSettlementContinue">继续/);
  assert.doesNotMatch(source, /继续\(\{\{settlementContinueSec/);
  assert.doesNotMatch(source, />返回</);
  assert.match(source, /wx:if="\{\{settlementCanContinue\}\}" class="sheet-actions"/);
});

test("settlement dialog uses a bounded sheet with an internal player list scroller", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxml, /<scroll-view class="settlement-scroll" scroll-y="true" enhanced="true" show-scrollbar="false">/);
  assert.match(wxss, /\.room-sheet--settlement\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column[\s\S]*max-height:\s*82vh/);
  assert.match(wxss, /\.sheet-body--settlement\s*\{[\s\S]*flex:\s*1[\s\S]*min-height:\s*0[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(wxss, /\.settlement-scroll\s*\{[\s\S]*flex:\s*1[\s\S]*min-height:\s*0/);
});

test("settlement dialog compresses row density for crowded eight-player results", () => {
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxss, /\.settlement-row\s*\{[\s\S]*gap:\s*10rpx[\s\S]*padding:\s*12rpx 14rpx/);
  assert.match(wxss, /\.settlement-avatar\s*\{[\s\S]*width:\s*52rpx[\s\S]*height:\s*52rpx/);
  assert.match(wxss, /\.settlement-die-wrap\s*\{[\s\S]*width:\s*40rpx[\s\S]*height:\s*40rpx/);
  assert.match(wxss, /\.settlement-matrix__row\s*\{[\s\S]*min-height:\s*82rpx/);
});

test("seating dialog reuses the settlement sheet skin", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const source = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxml, /class="room-sheet room-sheet--seating"/);
  assert.match(wxml, /class="sheet-head sheet-head--settings"/);
  assert.match(wxml, /class="sheet-close sheet-close--pill" bindtap="closeSeatingPanel">完成<\/view>/);
  assert.match(wxml, /class="seat-hero"/);
  assert.match(wxml, /class="seat-direction-panel__label">入座方向<\/text>/);
  assert.match(wxml, /class="seat-grid-panel"/);
  assert.match(source, /\.room-sheet--seating\s*\{[\s\S]*max-width:\s*682rpx/);
  assert.match(source, /\.seat-hero\s*\{/);
  assert.match(source, /\.seat-direction-panel,\s*\.seat-grid-panel\s*\{/);
});

test("seating dialog keeps only clockwise and counterclockwise shortcuts", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxml, /bindtap="onSeatingSelectDirection">顺时针<\/view>/);
  assert.match(wxml, /bindtap="onSeatingSelectDirection">逆时针<\/view>/);
  assert.doesNotMatch(wxml, /bindtap="clearSeatingSelection"/);
  assert.doesNotMatch(wxml, />清空<\/view>/);
  assert.doesNotMatch(wxss, /\.seat-direction__item--ghost\s*\{/);
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

test("room page keeps only the history drawer and no longer renders chat or voice channels", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");

  assert.match(wxml, /wx:if="\{\{historyVisible\}\}" class="room-drawer-overlay"/);
  assert.match(wxml, /class="room-social__tab \{\{historyVisible \? 'is-active' : ''\}\}" bindtap="toggleHistory">战绩<\/view>/);
  assert.doesNotMatch(wxml, /bindtap="toggleVoiceList"/);
  assert.doesNotMatch(wxml, /bindtap="toggleChatList"/);
  assert.doesNotMatch(wxml, /暂无语音/);
  assert.doesNotMatch(wxml, /暂无聊天/);
  assert.doesNotMatch(wxml, /说点什么/);
});
