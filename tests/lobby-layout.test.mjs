import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const lobbyWxmlPath = path.join(process.cwd(), "miniprogram/pages/lobby/lobby.wxml");
const lobbyWxssPath = path.join(process.cwd(), "miniprogram/pages/lobby/lobby.wxss");
const lobbyJsonPath = path.join(process.cwd(), "miniprogram/pages/lobby/lobby.json");

test("lobby keeps a fixed full-screen hero with create and join as the primary actions", () => {
  const wxml = fs.readFileSync(lobbyWxmlPath, "utf8");
  const wxss = fs.readFileSync(lobbyWxssPath, "utf8");
  const json = JSON.parse(fs.readFileSync(lobbyJsonPath, "utf8"));

  assert.match(wxml, /<view class="lobby-shell">/);
  assert.match(wxml, /<view class="hero-zone">/);
  assert.match(wxml, /class="home-logo"[\s\S]*mode="aspectFill"/);
  assert.match(wxml, /<view class="lobby-main">/);
  assert.match(wxml, /class="glass-card create-room-card"/);
  assert.match(wxml, /class="glass-card join-card"/);
  assert.match(wxml, /<text class="hero-title">满上，<\/text>/);
  assert.match(wxml, /<text class="hero-title">来一局<\/text>/);
  assert.doesNotMatch(wxml, /profile-card/);
  assert.doesNotMatch(wxml, /<view class="bottom-action">/);
  assert.doesNotMatch(wxml, /创建新局/);
  assert.doesNotMatch(wxml, /玩家001/);
  assert.doesNotMatch(wxml, /<scroll-view class="lobby-body-scroll"/);
  assert.doesNotMatch(wxml, /status-row/);
  assert.doesNotMatch(wxml, /status-right/);
  assert.doesNotMatch(wxml, /status-signal/);

  assert.equal(json.disableScroll, true);
  assert.match(wxss, /page\s*\{[\s\S]*height:\s*100%[\s\S]*overflow:\s*hidden/);
  assert.match(wxss, /\.lobby-page\s*\{[\s\S]*height:\s*100%/);
  assert.match(wxss, /\.lobby-page\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(wxss, /\.lobby-shell\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(wxss, /\.lobby-shell\s*\{[\s\S]*padding:\s*0\s+20rpx\s+calc\(126rpx \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(wxss, /\.hero-zone\s*\{[\s\S]*flex-shrink:\s*0/);
  assert.match(wxss, /\.hero-zone\s*\{[\s\S]*height:\s*424rpx[\s\S]*margin-left:\s*-20rpx[\s\S]*margin-right:\s*-20rpx/);
  assert.match(wxss, /\.home-logo\s*\{[\s\S]*top:\s*0[\s\S]*width:\s*100vw[\s\S]*height:\s*424rpx/);
  assert.match(wxss, /\.lobby-main\s*\{[\s\S]*flex:\s*1/);
  assert.match(wxss, /\.lobby-main\s*\{[\s\S]*margin-top:\s*22rpx/);
  assert.match(wxss, /\.panel-stack\s*\{[\s\S]*gap:\s*22rpx/);
});
