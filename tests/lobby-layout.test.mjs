import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const lobbyWxmlPath = path.join(process.cwd(), "miniprogram/pages/lobby/lobby.wxml");
const lobbyWxssPath = path.join(process.cwd(), "miniprogram/pages/lobby/lobby.wxss");
const lobbyJsonPath = path.join(process.cwd(), "miniprogram/pages/lobby/lobby.json");

test("lobby stays fully fixed while keeping the create button clear of the custom tab bar", () => {
  const wxml = fs.readFileSync(lobbyWxmlPath, "utf8");
  const wxss = fs.readFileSync(lobbyWxssPath, "utf8");
  const json = JSON.parse(fs.readFileSync(lobbyJsonPath, "utf8"));

  assert.match(wxml, /<view class="lobby-shell">/);
  assert.match(wxml, /<view class="hero-zone">/);
  assert.match(wxml, /<view class="lobby-main">/);
  assert.match(wxml, /<view class="bottom-action">/);
  assert.match(wxml, /<text class="hero-title">满上，<\/text>/);
  assert.match(wxml, /<text class="hero-title">来一局<\/text>/);
  assert.doesNotMatch(wxml, /<scroll-view class="lobby-body-scroll"/);
  assert.doesNotMatch(wxml, /status-row/);
  assert.doesNotMatch(wxml, /status-right/);
  assert.doesNotMatch(wxml, /status-signal/);

  assert.equal(json.disableScroll, true);
  assert.match(wxss, /page\s*\{[\s\S]*height:\s*100%[\s\S]*overflow:\s*hidden/);
  assert.match(wxss, /\.lobby-page\s*\{[\s\S]*height:\s*100%/);
  assert.match(wxss, /\.lobby-page\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(wxss, /\.lobby-shell\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(wxss, /\.lobby-shell\s*\{[\s\S]*padding:\s*calc\(88rpx \+ env\(safe-area-inset-top\)\)\s+20rpx\s+calc\(176rpx \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(wxss, /\.hero-zone\s*\{[\s\S]*flex-shrink:\s*0/);
  assert.match(wxss, /\.lobby-main\s*\{[\s\S]*flex:\s*1/);
  assert.match(wxss, /\.bottom-action\s*\{[\s\S]*margin-top:\s*auto/);
});
