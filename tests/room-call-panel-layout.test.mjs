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

  assert.match(roomWxml, /<scroll-view[\s\S]*wx:if="\{\{callSelectorMode !== 'point'\}\}"[\s\S]*class="call-phase-panel__counts-scroll"[\s\S]*scroll-x="true"/);
  assert.match(roomWxml, /scroll-into-view="\{\{'call-count-option-' \+ callCount\}\}"/);
  assert.match(roomWxml, /id="call-count-option-\{\{item\.value\}\}"/);
  assert.match(roomWxml, /<view class="call-phase-panel__counts">/);
  assert.match(roomWxml, /wx:if="\{\{callSelectorMode === 'point'\}\}" class="call-phase-panel__points"/);
  assert.match(roomWxml, /class="call-phase-panel__value-box"[\s\S]*hover-class="call-phase-panel__box--pressing"/);
  assert.match(roomWxml, /class="call-phase-panel__point-box \{\{callForcedOpen \? 'is-disabled' : ''\}\}"[\s\S]*hover-class="\{\{callForcedOpen \? 'none' : 'call-phase-panel__box--pressing'\}\}"/);
  assert.match(roomWxml, /class="call-phase-panel__count \{\{item\.value === callCount \? 'is-active' : ''\}\} \{\{item\.isTail \? 'is-tail' : ''\}\} \{\{callForcedOpen \|\| item\.disabled \? 'is-disabled' : ''\}\}"[\s\S]*hover-class="\{\{callForcedOpen \|\| item\.disabled \? 'none' : 'call-phase-panel__count--pressing'\}\}"/);
  assert.match(roomWxml, /class="call-phase-panel__point-option \{\{item\.value === callPoint \? 'is-active' : ''\}\} \{\{callForcedOpen \|\| item\.disabled \? 'is-disabled' : ''\}\}"[\s\S]*hover-class="\{\{callForcedOpen \|\| item\.disabled \? 'none' : 'call-phase-panel__point-option--pressing'\}\}"/);
  assert.match(roomWxml, /class="call-phase-panel__point-box \{\{callForcedOpen \? 'is-disabled' : ''\}\}"[\s\S]*class="call-phase-panel__voice-chip \{\{!callVoiceReady \? 'is-disabled' : ''\}\} \{\{recording \|\| voiceRecognizing \? 'is-active' : ''\}\}"[\s\S]*class="call-phase-panel__btn call-phase-panel__btn--primary/);
  assert.match(roomWxml, /<view[\s\S]*wx:if="\{\{!callForcedOpen\}\}"[\s\S]*class="call-phase-panel__voice-chip \{\{!callVoiceReady \? 'is-disabled' : ''\}\} \{\{recording \|\| voiceRecognizing \? 'is-active' : ''\}\}"[\s\S]*catchtouchstart="onVoiceTouchStart"[\s\S]*catchtouchend="onVoiceTouchEnd"[\s\S]*catchtouchcancel="onVoiceTouchCancel"/);
  assert.match(roomWxml, /recording \? '松开' : \(voiceRecognizing \? '识别' : '语音'\)/);
  assert.doesNotMatch(roomWxml, /call-phase-panel__voice-row/);
  assert.doesNotMatch(roomWxml, /call-phase-panel__voice-inline-tip/);
  assert.match(roomWxml, /bindtap="onSelectCallPointOption"/);
  assert.match(roomWxml, /item\.value === callPoint/);
  assert.doesNotMatch(roomWxml, /bindtap="onTapCallPointPicker"/);
  assert.doesNotMatch(roomJs, /showActionSheetSafe\(\{\s*itemList:\s*\["1点", "2点", "3点", "4点", "5点", "6点"\]/);
  assert.doesNotMatch(roomJs, /title:\s*"语音叫骰"/);
  assert.doesNotMatch(roomJs, /quickCall\(\)/);
  assert.match(roomJs, /callVoiceReady:\s*false,/);
  assert.match(roomJs, /this\.setData\(\{\s*callVoiceReady:\s*Boolean\(/);
  assert.match(roomJs, /callSelectorMode: isMyCallingTurn \? \(this\.data\.callSelectorMode \|\| "count"\) : ""/);
  assert.match(roomJs, /const DEFAULT_CALL_VOICE_TIP_TEXT = "按住说，识别后再确认";/);
  assert.match(roomJs, /const MAX_CALL_VOICE_DURATION_MS = 5000;/);
  assert.match(roomJs, /const VOICE_RECOGNITION_WAIT_MS = 3000;/);
  assert.match(roomJs, /const clientRequestId = `voice_\$\{Date\.now\(\)\}_\$\{Math\.floor\(Math\.random\(\) \* 100000\)\}`;/);
  assert.match(roomJs, /const transcriptPromise = this\.waitForVoiceTranscript\(clientRequestId\);/);
  assert.match(roomJs, /sendEvent\("voice:upload", \{[\s\S]*clientRequestId/);
  assert.match(roomJs, /waitForVoiceTranscript\(clientRequestId = "", timeoutMs = VOICE_RECOGNITION_WAIT_MS\)/);
  assert.match(roomJs, /const transcript = await transcriptPromise;/);
  assert.match(roomJs, /clearPendingVoiceTranscriptWait\(\)/);
  assert.match(roomJs, /resolvePendingVoiceTranscript\(result\)/);
  assert.match(roomJs, /rejectPendingVoiceTranscript\(message, options = \{\}\)/);
  assert.match(roomJs, /duration:\s*MAX_CALL_VOICE_DURATION_MS/);
  assert.match(roomJs, /actionEvent === "voice:upload"[\s\S]*rejectPendingVoiceTranscript/);
  assert.match(
    roomJs,
    /function buildCallPointOptionItems\(themeId,\s*options,\s*disabledValues\)\s*\{\s*return \(Array\.isArray\(options\) \? options : \[\]\)\.map\(\(value\) => \(\{\s*value:\s*String\(value\),[\s\S]*asset:\s*getRoomDieAsset\(value,\s*themeId\)/
  );
  assert.match(
    roomJs,
    /function buildCallCountOptionItems\(currentValue, maxValue = 1, minValue = 1\)\s*\{[\s\S]*for \(let value = min; value <= max; value \+= 1\)/
  );
  assert.match(roomJs, /function canCallCountClient\(lastCall, nextCount, minOpeningCount = 1\)/);
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
  assert.match(roomJs, /const showQuickOpenAction = false;/);
  assert.match(roomJs, /if \(!forcedOpen\) \{\s*this\.haptic\("light"\);\s*this\.openCallPanel\(\);\s*return;\s*\}/);
  assert.doesNotMatch(roomWxml, /wx:if="\{\{showQuickOpenAction\}\}"[\s\S]*bindtap="openDice"/);
  assert.match(roomWxss, /\.call-phase-overlay\s*\{[\s\S]*top:\s*0/);
  assert.match(roomWxss, /\.call-phase-overlay\s*\{[\s\S]*display:\s*flex/);
  assert.match(roomWxss, /\.call-phase-overlay\s*\{[\s\S]*align-items:\s*flex-end/);
  assert.match(roomWxml, /class="room-fab \{\{phase === 'rolling' && secondaryActionKind === 'reroll' \? 'room-fab--left room-fab--paired' : ''\}\} \{\{canPrimaryAction \? '' : 'is-disabled'\}\} \{\{primaryActionText === '叫牌' \? roomThemeAssets\.primaryButtonClass : ''\}\} \{\{roomThemeId === 'ruby-red' && primaryActionText && primaryActionText !== '叫牌' && primaryActionText !== '开牌' \? 'room-fab--ruby-open-slice' : ''\}\}"[\s\S]*hover-class="\{\{canPrimaryAction \? 'room-fab--pressing' : 'none'\}\}"/);
  assert.match(roomWxml, /<image wx:if="\{\{secondaryActionKind === 'open' && secondaryActionText === '开牌' && roomThemeAssets\.openButtonSrc\}\}" class="room-fab-secondary__skin"/);
  assert.match(roomWxml, /<image wx:if="\{\{primaryActionText === '叫牌' && roomThemeAssets\.primaryButtonSrc\}\}" class="room-fab__skin"/);
  assert.match(roomWxss, /\.room-fab\s*\{[\s\S]*right:\s*18rpx[\s\S]*top:\s*36rpx[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx[\s\S]*border-radius:\s*999rpx[\s\S]*flex-direction:\s*row/);
  assert.match(roomWxss, /\.room-fab\.room-fab--paired\s*\{[\s\S]*width:\s*176rpx[\s\S]*height:\s*84rpx[\s\S]*padding:\s*0 20rpx/);
  assert.match(roomWxss, /\.room-fab-secondary\s*\{/);
  assert.match(roomWxss, /\.room-fab-secondary\s*\{[\s\S]*right:\s*74rpx[\s\S]*top:\s*-96rpx[\s\S]*width:\s*82rpx[\s\S]*height:\s*82rpx[\s\S]*border-radius:\s*50%/);
  assert.match(roomWxss, /\.room-fab-secondary--pressing\s*\{/);
  assert.match(roomWxss, /\.room-fab--pressing\s*\{/);
  assert.match(roomWxss, /\.call-phase-panel__btn--pressing\s*\{/);
  assert.doesNotMatch(roomWxss, /\.call-phase-panel__voice-row\s*\{/);
  assert.match(roomWxss, /\.call-phase-panel__voice-chip\s*\{[\s\S]*flex:\s*0 0 92rpx[\s\S]*width:\s*92rpx[\s\S]*height:\s*92rpx[\s\S]*border-radius:\s*22rpx/);
  assert.match(roomWxss, /\.call-phase-panel__voice-chip\.is-active\s*\{/);
  assert.match(roomWxss, /\.call-phase-panel__voice-chip\.is-disabled\s*\{/);
  assert.match(roomWxss, /\.call-phase-panel__btn--primary\s*\{[\s\S]*flex:\s*0 0 250rpx[\s\S]*min-width:\s*250rpx/);
  assert.match(roomWxss, /\.page\.room-theme-jade-green \.call-phase-panel__voice-chip\s*\{/);
  assert.match(roomWxss, /\.page\.room-theme-ruby-red \.call-phase-panel__voice-chip\s*\{/);
  assert.match(roomWxss, /\.page\.room-theme-imperial-red \.call-phase-panel__voice-chip\s*\{/);
  assert.match(roomWxss, /\.page\.room-theme-glacier-blue \.call-phase-panel__voice-chip\s*\{/);
});

test("room call panel stays content-sized instead of reserving an empty lower half", () => {
  const roomWxss = fs.readFileSync(roomWxssPath, "utf8");

  assert.doesNotMatch(roomWxss, /\.call-phase-panel\s*\{[\s\S]*min-height:\s*560rpx/);
  assert.match(roomWxss, /\.call-phase-overlay\s*\{[\s\S]*padding:\s*0 16rpx 0/);
  assert.match(roomWxss, /\.call-phase-panel\s*\{[\s\S]*padding:\s*24rpx 24rpx calc\(92rpx \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(roomWxss, /\.call-phase-overlay\s*\{[\s\S]*rgba\(15, 19, 27, 0\.98\) 100%/);
  assert.match(roomWxss, /\.call-phase-panel\s*\{[\s\S]*animation:\s*call-phase-panel-rise 140ms cubic-bezier\(0\.22, 0\.9, 0\.32, 1\)/);
  assert.match(roomWxss, /\.call-phase-panel__counts-scroll\s*\{[\s\S]*width:\s*100%/);
  assert.match(roomWxss, /\.call-phase-panel__counts\s*\{[\s\S]*width:\s*max-content/);
  assert.match(roomWxss, /\.call-phase-panel__count\s*\{[\s\S]*flex:\s*0 0 116rpx/);
});
