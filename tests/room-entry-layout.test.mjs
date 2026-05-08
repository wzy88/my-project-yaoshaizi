import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roomWxmlPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxml");
const roomJsPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");
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

test("room page hides room visuals until the initial theme is resolved", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  const js = fs.readFileSync(roomJsPath, "utf8");

  assert.match(wxml, /roomThemeReady \? 'is-theme-ready' : 'is-theme-pending'/);
  assert.match(wxml, /class="room-theme-loader"/);
  assert.equal([...wxml.matchAll(/class="room-theme-loader"/g)].length, 1);
  assert.match(wxml, /wx:if="\{\{!roomThemeReady \|\| roomThemeLoading \|\| \(legalAccepted && pendingActionText && connecting\)\}\}" class="room-theme-loader"/);
  assert.match(wxml, /class="room-theme-loader__theme">主题 \{\{roomThemeManifest\.label\}\}<\/text>/);
  assert.match(wxss, /@keyframes room-theme-loader-spin/);
  assert.match(wxss, /\.page\.room-screen\.is-theme-ready\.room-theme-ruby-red \.room-theme-loader__bar-fill/);
  assert.match(wxss, /\.page\.room-screen\.is-theme-ready\.room-theme-glacier-blue \.room-theme-loader__theme/);
  assert.match(wxss, /\.page\.room-screen\.is-theme-pending \.room-shell,[\s\S]*opacity:\s*0/);
  assert.match(js, /resolveInitialRoomThemeForLoad\(options, cached\)/);
  assert.match(js, /hasInitialRoomThemeHintForLoad\(options, cached\)/);
  assert.match(js, /const shouldWaitForAuthoritativeRoomTheme = mode === "join" && !hasInitialRoomThemeHint/);
  assert.match(js, /roomThemeReady:\s*!shouldWaitForAuthoritativeRoomTheme,[\s\S]*buildRoomThemePresentation\(initialRoomThemeId\)/);
  assert.match(js, /roomThemeLoadingTitle:\s*"正在进入房间"[\s\S]*roomThemeLoadingStep:\s*text[\s\S]*roomThemeLoadingProgress:\s*28/);
});

test("room shell keeps the room id centered while moving invite outside and rules onto the table", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.doesNotMatch(wxml, /class="room-safe-panel"/);
  assert.match(wxml, /class="room-topbar__shortcut" bindtap="onTapMore"/);
  assert.match(wxml, /class="room-topbar__shortcut-text">\{\{selfIsOwner \? '管理' : '设置'\}\}<\/text>/);
  assert.match(wxml, /class="room-topbar__shortcut room-topbar__shortcut--ghost room-topbar__shortcut--share" open-type="share" bindtap="onTapShareRoom"/);
  assert.match(wxml, /class="room-topbar__shortcut-text">喊人<\/text>/);
  assert.match(wxml, /class="room-topbar-menu-popover"/);
  assert.match(wxml, /class="room-topbar-menu-popover__text">最近记录<\/text>/);
  assert.match(wxml, /class="room-topbar-menu-popover__text">音效开关<\/text>/);
  assert.match(wxml, /class="room-stage__rule-entry" bindtap="onTapRules"/);
  assert.match(wxml, /class="room-stage__rule-entry-text">规则<\/text>/);
  assert.doesNotMatch(wxml, /class="room-topbar-menu-popover__text">设置<\/text>/);
  assert.doesNotMatch(wxml, /class="room-topbar-menu-popover__text">邀请好友<\/text>/);
  assert.doesNotMatch(wxml, /class="room-chrome-btn room-chrome-btn--menu" bindtap="onTapMore"/);
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
  assert.match(wxss, /\.room-topbar__shortcut--share\s*\{/);
  assert.match(wxss, /\.room-topbar__shortcut\s*\{[\s\S]*width:\s*84rpx[\s\S]*min-width:\s*84rpx/);
  assert.match(wxss, /button\.room-topbar__shortcut::after\s*\{[\s\S]*border:\s*0/);
  assert.match(wxss, /\.room-topbar__shortcut--share\s*\{[\s\S]*width:\s*84rpx[\s\S]*min-width:\s*84rpx/);
  assert.match(wxss, /\.room-stage__rule-entry\s*\{/);
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
  assert.match(script, /const themeId = normalizeRoomThemeId\(this\.data\.createRoomThemeId\)/);
  assert.match(script, /const incomingThemeManifest = payload\.themeManifest/);
  assert.match(script, /: \(roomConfig && roomConfig\.themeId\)/);
  assert.match(script, /const provisionalThemeId = parseOptionalRoomThemeId\(this\.data\.joinRoomThemeId\)\s*\|\|\s*parseOptionalRoomThemeId\(this\.data\.createRoomThemeId\)/);
  assert.match(script, /resolveRoomThemeId\(roomId,\s*incomingThemeId,\s*provisionalThemeId\)/);
  assert.match(script, /hasReceivedAuthoritativeRoomTheme:\s*false/);
  assert.match(script, /hasReceivedAuthoritativeRoomTheme:\s*Boolean\(incomingThemeId\) \|\| this\.data\.hasReceivedAuthoritativeRoomTheme/);
  assert.match(script, /ROOM_THEME_CACHE_KEY/);
  assert.match(script, /buildRoomShareEntryUrl\(roomId,\s*themeId\)/);
  assert.match(wxss, /\.page\.room-theme-imperial-red \.room-stage__table-frame\s*\{/);
  assert.match(wxss, /\.page\.room-theme-imperial-red \.ghost-cup \.figma-cup__body\s*\{/);
  assert.match(wxss, /@keyframes imperial-red-bubble-sheen/);
  assert.match(wxss, /\.page\.room-theme-imperial-red \.seat__bubble\.latest::before\s*\{[\s\S]*animation:\s*imperial-red-bubble-sheen/);
  assert.match(wxss, /\.page\.room-theme-imperial-red \.room-fab\.room-fab--imperial-slice\.room-fab--pressing,[\s\S]*box-shadow:\s*none/);
  assert.match(wxss, /\.page\.room-theme-ruby-red \.room-stage__table-frame\s*\{/);
  assert.match(wxss, /\.page\.room-theme-ruby-red \.seat__bubble\s*\{/);
  assert.match(wxss, /\.page\.room-theme-glacier-blue \.room-stage__table-frame\s*\{/);
  assert.match(wxss, /\.page\.room-theme-glacier-blue \.room-stage__observer-card\s*\{/);
  assert.match(wxss, /@keyframes glacier-blue-bubble-sheen/);
  assert.match(wxss, /\.page\.room-theme-glacier-blue \.seat__bubble\.latest::before,[\s\S]*animation:\s*glacier-blue-bubble-sheen/);
  assert.match(wxss, /\.page\.room-theme-glacier-blue \.room-fab\.room-fab--glacier-slice\.room-fab--pressing,[\s\S]*box-shadow:\s*none/);
  assert.doesNotMatch(wxss, /\.page\.room-theme-sapphire-blue /);
  assert.doesNotMatch(wxss, /\.page\.room-theme-mist-ivory /);
  assert.match(script, /getSelfDieAsset/);
  assert.match(script, /buildDiceFaceItems\(this\.data\.privateDice,\s*roomThemeId\)/);
});

test("room join waits for the server theme instead of caching entry hints as final theme", () => {
  const script = fs.readFileSync(roomJsPath, "utf8");
  const joinBlock = script.match(/} else if \(mode === "join"\) \{[\s\S]*?\n    \}/);
  assert.ok(joinBlock, "join onLoad block should exist");
  assert.doesNotMatch(joinBlock[0], /this\.cacheRoomTheme\(roomId,\s*themeId\)/);

  const sendJoinBlock = script.match(/async sendJoinActionAfterThemeLoad\(action\) \{[\s\S]*?\n  \},/);
  assert.ok(sendJoinBlock, "sendJoinActionAfterThemeLoad should exist");
  assert.doesNotMatch(sendJoinBlock[0], /prepareRoomThemeForEntry/);
  assert.match(sendJoinBlock[0], /const keepRoomReady = Boolean\(this\.initialRoomThemeHintReady \|\| this\.data\.roomThemeReady\)/);

  const ackThemeBlock = script.match(/const nextThemeId = \(ackThemeManifest && ackThemeManifest\.id\)[\s\S]*?;\n/);
  assert.ok(ackThemeBlock, "ack theme selection block should exist");
  assert.doesNotMatch(ackThemeBlock[0], /getCachedRoomTheme/);
  assert.doesNotMatch(ackThemeBlock[0], /joinRoomThemeId/);
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
  assert.match(source, /\.page\.room-theme-ruby-red \.room-shell__bottom-fade\s*\{[\s\S]*transform:\s*translateY\(-72rpx\)/);
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

test("room owner live seating only renders the mark badge for actual next-round changes", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  assert.match(wxml, /<view wx:if="\{\{item\.tagText === '下局旁观'\}\}" class="seat-live-row__mark is-active">✓<\/view>/);
  assert.match(wxml, /<view wx:if="\{\{item\.tagText === '待上桌'\}\}" class="seat-live-row__mark is-active">✓<\/view>/);
  assert.doesNotMatch(wxml, /<view class="seat-live-row__mark \{\{item\.tagText === '下局旁观' \? 'is-active' : ''\}\}">\{\{item\.tagText === '下局旁观' \? '✓' : ''\}\}<\/view>/);
  assert.doesNotMatch(wxml, /<view class="seat-live-row__mark \{\{item\.tagText === '待上桌' \? 'is-active' : ''\}\}">\{\{item\.tagText === '待上桌' \? '✓' : ''\}\}<\/view>/);
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

test("room theme details keep seat color, bubble tail, and button geometry consistent", () => {
  const js = fs.readFileSync(roomJsPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  const qaSectionStart = wxss.indexOf("/* theme QA locks: color-only theme changes must not alter gameplay geometry */");
  const qaSection = qaSectionStart >= 0 ? wxss.slice(qaSectionStart) : "";

  assert.doesNotMatch(js, /status === "open" \? "is-jade" : "is-slot"/);
  assert.match(js, /return \["is-lit", normalizedSeatIndex \? `is-seat-tone-\$\{normalizedSeatIndex\}` : ""\]/);

  for (let seatIndex = 1; seatIndex <= 8; seatIndex += 1) {
    assert.match(wxss, new RegExp(`\\.seat-stage-cup\\.is-seat-tone-${seatIndex}\\s*\\{`));
  }

  assert.match(qaSection, /\.seat-stage-cup\.is-lit\s*\{[\s\S]*brightness\(1\.08\)[\s\S]*saturate\(1\.16\);/);
  assert.doesNotMatch(qaSection, /\.seat-stage-cup\.is-lit::after/);
  assert.doesNotMatch(qaSection, /drop-shadow\(0 0 18rpx var\(--seat-cup-tone\)\)/);
  assert.match(qaSection, /non-black lit cups reuse the black-room cup color treatment[\s\S]*\.page\.room-theme-jade-green \.seat-stage-cup\.is-lit,[\s\S]*\.page\.room-theme-imperial-red \.seat-stage-cup\.is-lit,[\s\S]*\.page\.room-theme-glacier-blue \.seat-stage-cup\.is-lit\s*\{[\s\S]*brightness\(1\.5\)[\s\S]*saturate\(1\.18\);/);
  assert.doesNotMatch(qaSection, /drop-shadow\(0 0 24rpx rgba\(255, 222, 150, 0\.34\)\)/);
  assert.doesNotMatch(qaSection, /0 0 16rpx rgba\(255, 218, 138, 0\.2\)/);
  assert.doesNotMatch(wxss, /drop-shadow\(0 0 24rpx rgba\(255, 222, 150, 0\.34\)\)/);
  assert.doesNotMatch(wxss, /drop-shadow\(0 0 20rpx rgba\(241, 207, 118, 0\.26\)\)/);
  assert.doesNotMatch(wxss, /0 0 16rpx rgba\(255, 218, 138, 0\.2\)/);
  assert.match(qaSection, /\.page\.room-theme-jade-green \.seat-stage-cup\.is-lit \.figma-cup__skin,[\s\S]*\.page\.room-theme-glacier-blue \.seat-stage-cup\.is-lit \.figma-cup__skin\s*\{[\s\S]*display:\s*none/);
  assert.match(qaSection, /\.page\.room-theme-jade-green \.seat-stage-cup\.is-lit \.figma-cup__body,[\s\S]*\.page\.room-theme-glacier-blue \.seat-stage-cup\.is-lit \.figma-cup__body\s*\{[\s\S]*width:\s*46rpx[\s\S]*height:\s*64rpx/);
  assert.match(qaSection, /\.page\.room-theme-jade-green \.seat-stage-cup\.is-lit\.seat-stage-cup--slot-upper-left \.figma-cup__body,[\s\S]*rgb\(245, 216, 96\)/);
  assert.match(qaSection, /\.page\.room-theme-jade-green \.seat-stage-cup\.is-lit\.seat-stage-cup--slot-mid-right \.figma-cup__body,[\s\S]*rgb\(58, 56, 72\)/);
  assert.match(qaSection, /\.page\.room-theme-glacier-blue \.seat__bubble::after,[\s\S]*rgba\(221, 250, 255, 0\.98\)/);
  assert.match(qaSection, /\.page\.room-theme-glacier-blue \.seat__bubble\.latest::after,[\s\S]*rgba\(242, 128, 96, 0\.98\)/);
  assert.match(qaSection, /\.page\.room-theme-glacier-blue \.seat__name,[\s\S]*color:\s*#123b5e/);

  assert.match(qaSection, /every call bubble keeps its round tail dot on the top layer[\s\S]*\.seat__bubble,[\s\S]*\.room-self__bubble,[\s\S]*\.page\.room-theme-glacier-blue \.room-self__bubble\s*\{[\s\S]*overflow:\s*visible[\s\S]*z-index:\s*36/);
  assert.match(qaSection, /\.seat__bubble::after,[\s\S]*\.room-self__bubble::after\s*\{[\s\S]*z-index:\s*9[\s\S]*pointer-events:\s*none/);
  assert.match(qaSection, /bubble tail dots keep one shared position and size[\s\S]*width:\s*16rpx[\s\S]*height:\s*16rpx/);
  assert.match(qaSection, /\.page\.room-theme-glacier-blue \.seat__bubble--slot-upper-left::after,[\s\S]*left:\s*-8rpx[\s\S]*top:\s*50%[\s\S]*transform:\s*translateY\(-50%\)/);
  assert.match(qaSection, /\.page\.room-theme-glacier-blue \.seat__bubble--slot-lower-right::after\s*\{[\s\S]*right:\s*-8rpx[\s\S]*top:\s*50%[\s\S]*transform:\s*translateY\(-50%\)/);
  assert.match(qaSection, /\.page\.room-theme-glacier-blue \.room-self__bubble::after\s*\{[\s\S]*left:\s*-10rpx[\s\S]*top:\s*50%[\s\S]*transform:\s*translateY\(-50%\)/);

  assert.match(qaSection, /\.page\.room-theme-glacier-blue \.room-fab\.room-fab--glacier-slice\s*\{[\s\S]*top:\s*36rpx[\s\S]*bottom:\s*auto[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx[\s\S]*border-radius:\s*999rpx/);
  assert.match(qaSection, /black room call button uses native dark-gold chrome[\s\S]*\.page\.room-theme-ruby-red \.room-fab\.room-fab--ruby-slice\s*\{[\s\S]*top:\s*36rpx[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx/);
  assert.match(qaSection, /\.page\.room-theme-ruby-red \.room-fab\.room-fab--ruby-slice \.room-fab__skin\s*\{[\s\S]*display:\s*none/);
  assert.match(qaSection, /black room open button uses native dark-gold chrome[\s\S]*\.page\.room-theme-ruby-red \.room-fab-secondary\.room-fab-secondary--ruby-slice\s*\{[\s\S]*left:\s*32rpx[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx/);
  assert.match(qaSection, /\.page\.room-theme-ruby-red \.room-fab-secondary\.room-fab-secondary--ruby-slice \.room-fab-secondary__skin\s*\{[\s\S]*display:\s*none/);
  const actionGeometryStart = qaSection.indexOf("/* theme QA locks: non-black room action buttons use the black-room geometry baseline */");
  const actionGeometryEnd = qaSection.indexOf("/* theme QA locks: red room buttons use the black-room geometry without shrunken SVG slice padding */", actionGeometryStart);
  assert.ok(actionGeometryStart >= 0);
  assert.ok(actionGeometryEnd > actionGeometryStart);
  const actionGeometrySection = qaSection.slice(actionGeometryStart, actionGeometryEnd);
  assert.doesNotMatch(actionGeometrySection, /room-theme-ruby-red/);
  assert.match(actionGeometrySection, /\.page\.room-theme-jade-green \.room-fab,[\s\S]*\.page\.room-theme-glacier-blue \.room-fab\.room-fab--glacier-slice\s*\{[\s\S]*right:\s*18rpx[\s\S]*top:\s*36rpx[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx/);
  assert.match(qaSection, /\.page\.room-theme-jade-green \.room-fab\.room-fab--paired\.room-fab--left,[\s\S]*\.page\.room-theme-glacier-blue \.room-fab\.room-fab--paired\.room-fab--left\s*\{[\s\S]*left:\s*24rpx[\s\S]*right:\s*auto[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx/);
  assert.match(qaSection, /red room buttons use the black-room geometry without shrunken SVG slice padding[\s\S]*\.page\.room-theme-imperial-red \.room-fab\.room-fab--imperial-slice,[\s\S]*\.page\.room-theme-imperial-red \.room-fab-secondary\.room-fab-secondary--imperial-slice\s*\{[\s\S]*border:\s*2rpx solid rgba\(244, 216, 139, 0\.82\)/);
  assert.match(qaSection, /\.page\.room-theme-imperial-red \.room-fab\.room-fab--imperial-slice \.room-fab__skin,[\s\S]*\.page\.room-theme-imperial-red \.room-fab-secondary\.room-fab-secondary--imperial-slice \.room-fab-secondary__skin\s*\{[\s\S]*display:\s*none/);
  assert.match(qaSection, /white room buttons use the black-room geometry without shrunken SVG slice padding[\s\S]*\.page\.room-theme-glacier-blue \.room-fab\.room-fab--glacier-slice\s*\{[\s\S]*border:\s*2rpx solid rgba\(225, 252, 255, 0\.9\)/);
  assert.match(qaSection, /\.page\.room-theme-glacier-blue \.room-fab\.room-fab--glacier-slice \.room-fab__skin,[\s\S]*\.page\.room-theme-glacier-blue \.room-fab-secondary\.room-fab-secondary--glacier-slice \.room-fab-secondary__skin\s*\{[\s\S]*display:\s*none/);
  assert.match(qaSection, /\.page\.room-theme-jade-green \.room-fab-secondary--left,[\s\S]*\.page\.room-theme-glacier-blue \.room-fab-secondary\.room-fab-secondary--glacier-slice\s*\{[\s\S]*left:\s*32rpx[\s\S]*top:\s*36rpx[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx/);
  assert.match(qaSection, /\.page\.room-theme-jade-green \.room-fab-secondary--right,[\s\S]*\.page\.room-theme-glacier-blue \.room-fab-secondary--right\s*\{[\s\S]*right:\s*24rpx[\s\S]*top:\s*36rpx[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx/);
  assert.match(qaSection, /\.page\.room-theme-jade-green \.room-fab--pressing,[\s\S]*\.page\.room-theme-glacier-blue \.room-fab\.is-disabled\s*\{[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx/);
  assert.match(qaSection, /\.page\.room-theme-jade-green \.room-fab-secondary--pressing,[\s\S]*\.page\.room-theme-glacier-blue \.room-fab-secondary\.is-disabled\s*\{[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx/);
  assert.match(qaSection, /\.page\.room-theme-glacier-blue \.room-fab-secondary\.room-fab-secondary--glacier-slice\s*\{[\s\S]*top:\s*36rpx[\s\S]*bottom:\s*auto[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx/);
});

test("call panel disabled choices read as locked across themes", () => {
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  const readabilityStart = wxss.indexOf("/* Final call-panel readability pass: selectable and locked choices must read differently. */");
  const readabilitySection = readabilityStart >= 0 ? wxss.slice(readabilityStart) : "";

  assert.ok(readabilityStart > wxss.indexOf("opacity: 0.44"));
  assert.match(readabilitySection, /\.call-phase-panel__count:not\(\.is-disabled\):not\(\.is-active\),[\s\S]*border-color:\s*rgba\(235, 242, 250, 0\.18\)/);
  assert.match(readabilitySection, /\.call-phase-panel__count\.is-disabled,[\s\S]*\.call-phase-panel__point-box\.is-disabled\s*\{[\s\S]*opacity:\s*1;[\s\S]*repeating-linear-gradient\(135deg/);
  assert.match(readabilitySection, /\.call-phase-panel__count\.is-disabled::after,[\s\S]*height:\s*3rpx;[\s\S]*transform:\s*rotate\(-28deg\)/);
  assert.match(readabilitySection, /\.call-phase-panel__point-option\.is-disabled \.call-phase-panel__point-option-die,[\s\S]*filter:\s*grayscale\(1\) saturate\(0\.35\) contrast\(0\.62\) brightness\(0\.62\)/);
  assert.match(readabilitySection, /\.call-phase-panel__btn\.is-disabled\s*\{[\s\S]*filter:\s*grayscale\(1\) saturate\(0\.3\) brightness\(0\.74\)/);

  for (const themeId of ["jade-green", "ruby-red", "imperial-red", "glacier-blue"]) {
    assert.match(
      readabilitySection,
      new RegExp(`\\.page\\.room-theme-${themeId} \\.call-phase-panel__count\\.is-disabled,`)
    );
  }
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

test("room entry and settlement names allow twelve-character nicknames while settlement names stay single-line", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");

  assert.match(wxml, /class="join-input"[\s\S]*maxlength="12"/);
  assert.match(wxml, /class="settlement-name \{\{item\.nameLengthClass\}\}">\{\{item\.name\}\}<\/text>/);
  assert.match(wxss, /\.settlement-name\s*\{[\s\S]*max-width:\s*132rpx[\s\S]*white-space:\s*nowrap/);
  assert.match(wxss, /\.settlement-name\.is-long\s*\{[\s\S]*font-size:\s*21rpx/);
  assert.match(wxss, /\.settlement-name\.is-extra-long\s*\{[\s\S]*font-size:\s*18rpx/);
});

test("room bubble tails use the softer rounded pointer treatment", () => {
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxss, /\.seat__bubble::after\s*\{[\s\S]*width:\s*16rpx[\s\S]*height:\s*16rpx[\s\S]*border-radius:\s*50%/);
  assert.match(wxss, /\.seat__bubble--slot-upper-left::after,[\s\S]*left:\s*-8rpx[\s\S]*top:\s*50%[\s\S]*transform:\s*translateY\(-50%\)/);
  assert.match(wxss, /\.seat__bubble--slot-upper-right::after,[\s\S]*right:\s*-8rpx[\s\S]*top:\s*50%[\s\S]*transform:\s*translateY\(-50%\)/);
  assert.match(wxss, /\.room-self__bubble::after\s*\{[\s\S]*top:\s*50%[\s\S]*transform:\s*translateY\(-50%\)/);
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
  assert.match(source, /sheet-close sheet-close--pill"\s+bindtap="onTapSettlementLeave">离开/);
  assert.match(source, /wx:if="\{\{settlementCanContinue\}\}" class="sheet-actions"/);
});

test("settlement dialog uses a bounded sheet with an internal player list scroller", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");
  assert.match(wxml, /<scroll-view class="settlement-scroll" scroll-y="true" enhanced="true" show-scrollbar="false">/);
  assert.match(wxss, /\.room-sheet--settlement\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column[\s\S]*max-height:\s*82vh/);
  assert.match(wxss, /\.sheet-body--settlement\s*\{[\s\S]*flex:\s*1[\s\S]*min-height:\s*0[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(wxss, /\.settlement-scroll\s*\{[\s\S]*flex:\s*1[\s\S]*min-height:\s*0[\s\S]*overflow:\s*hidden/);
  assert.match(wxss, /\.settlement-scroll \.settlement-list\s*\{[\s\S]*padding-bottom:\s*12rpx/);
  assert.match(wxss, /\.settlement-matrix\s*\{[\s\S]*flex:\s*0 0 auto[\s\S]*margin-top:\s*4rpx/);
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
  assert.match(wxml, /class="room-mask room-mask--seating"/);
  assert.match(wxml, /class="seat-topbar__back" bindtap="closeSeatingPanel">‹<\/view>/);
  assert.match(wxml, /class="seat-topbar__title">\{\{seatingMode === 'staging' \? '安排座位' : '房主管理'\}\}<\/view>/);
  assert.match(wxml, /<scroll-view class="sheet-body sheet-body--settings sheet-body--seating" scroll-y="true"/);
  assert.match(wxml, /class="seat-header-copy__title">下一局开始前统一排位<\/text>/);
  assert.match(wxml, /class="seat-live-section__title">桌上玩家（\{\{seatingLivePlayers.length\}\}）<\/text>/);
  assert.match(wxml, /class="seat-staging-layout"/);
  assert.match(wxml, /class="seat-sidebar-panel__title">待上桌（\{\{seatingDraftPendingRows.length\}\}）<\/text>/);
  assert.match(source, /\.room-mask--seating\s*\{[\s\S]*align-items:\s*flex-start/);
  assert.match(source, /\.room-sheet--seating\s*\{[\s\S]*max-width:\s*638rpx/);
  assert.match(source, /\.seat-topbar__title\s*\{/);
  assert.match(source, /\.seat-direction-switch\s*\{/);
  assert.match(source, /\.seat-staging-layout\s*\{[\s\S]*display:\s*flex/);
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
  assert.match(wxml, /class="seat-board-card__head"/);
  assert.match(wxml, /class="seat-live-row__action seat-live-row__action--\{\{item\.actionClass\}\}"/);
  assert.match(wxml, /class="seat-side-card__action">下局上桌<\/text>/);
  assert.doesNotMatch(wxml, /class="seat-grid__row"/);
  assert.match(wxss, /\.seat-grid\s*\{[\s\S]*display:\s*grid/);
  assert.match(wxss, /\.seat-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(wxss, /\.seat-board-card\s*\{[\s\S]*min-height:\s*200rpx/);
  assert.match(wxss, /\.seat-board-card\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(wxss, /\.seat-board-card__head\s*\{[\s\S]*justify-content:\s*space-between/);
  assert.match(wxss, /\.seat-staging-sidebar\s*\{[\s\S]*flex:\s*0 0 196rpx/);
  assert.match(wxss, /\.seat-side-card__action\s*\{[\s\S]*flex:\s*0 0 100%/);
  assert.match(wxss, /\.seat-footer--dual \.seat-submit__text\s*\{[\s\S]*font-size:\s*23rpx/);
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

test("room page keeps only the recent-history modal and no longer renders chat or voice channels", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");

  assert.match(wxml, /wx:if="\{\{historyVisible\}\}" class="room-mask room-mask--settings" bindtap="toggleHistory"/);
  assert.match(wxml, /class="room-sheet room-sheet--settings room-sheet--history"/);
  assert.match(wxml, /class="sheet-title">最近记录<\/text>/);
  assert.match(wxml, /class="history-tab \{\{historyItem\.round === historyActiveRound \? 'is-active' : ''\}\}"/);
  assert.match(wxml, /class="history-card__round">第\{\{historyItem\.round\}\}局<\/text>/);
  assert.doesNotMatch(wxml, /bindtap="toggleVoiceList"/);
  assert.doesNotMatch(wxml, /bindtap="toggleChatList"/);
  assert.doesNotMatch(wxml, /暂无语音/);
  assert.doesNotMatch(wxml, /暂无聊天/);
  assert.doesNotMatch(wxml, /说点什么/);
});

test("room page countdown uses the compact numeric style and owner seating entry remains available before or after rounds", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");

  assert.match(wxml, /<text class="room-turn-countdown__text">\{\{turnCountdownSec\}\}<\/text>/);
  assert.doesNotMatch(wxml, /\{\{turnCountdownSec\}\}秒/);
  assert.match(wxml, /class="room-topbar__shortcut-text">\{\{selfIsOwner \? '管理' : '设置'\}\}<\/text>/);
  assert.match(wxml, /wx:if="\{\{selfIsOwner\}\}" class="room-topbar-menu-popover__item" bindtap="onTapMenuSeating"/);
  assert.doesNotMatch(wxml, /class="room-topbar__shortcut room-topbar__shortcut--ghost" bindtap="onTapMenuSeating"/);
});

test("room page exposes direct waiting-seat entry and moves spectator identity to the table corner", () => {
  const wxml = fs.readFileSync(roomWxmlPath, "utf8");
  const wxss = fs.readFileSync(roomWxssPath, "utf8");

  assert.match(wxml, /wx:if="\{\{selfIsOwner && \(waitingPlayerCount > 0 \|\| ownerSeatingRequired\) && \(phase === 'ready' \|\| phase === 'ended'\)\}\}"\s+class="room-stage__waiting-entry"/);
  assert.match(wxml, /<text class="room-stage__waiting-entry-text">\{\{waitingPlayerCount > 0 \? \('待上桌\(' \+ waitingPlayerCount \+ '\)'\) : '安排下一局'\}\}<\/text>/);
  assert.match(wxml, /wx:if="\{\{selfIsWaiting\}\}" class="room-stage__observer-card"/);
  assert.match(wxml, /<text class="room-stage__observer-status">\{\{seatingObserverStatusText\}\}<\/text>/);
  assert.match(wxml, /<view wx:if="\{\{!selfIsWaiting\}\}" class="room-self" style="\{\{roomSelfStyle\}\}">/);
  assert.match(wxss, /\.room-stage__waiting-entry\s*\{[\s\S]*top:\s*204rpx;[\s\S]*left:\s*52rpx;/);
  assert.match(wxss, /\.room-stage__observer-card\s*\{[\s\S]*top:\s*196rpx;[\s\S]*left:\s*52rpx;/);
});
