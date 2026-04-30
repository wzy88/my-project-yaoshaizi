import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const lobbyWxssPath = path.join(process.cwd(), "miniprogram/pages/lobby/lobby.wxss");
const customTabBarWxmlPath = path.join(process.cwd(), "miniprogram/custom-tab-bar/index.wxml");

test("lobby login overlay uses the shared bottom-sheet visual and hides the custom tab bar", () => {
  const source = fs.readFileSync(lobbyWxssPath, "utf8");

  assert.match(source, /\.login-gate\s*\{[\s\S]*position:\s*fixed/);
  assert.match(source, /\.login-gate\s*\{[\s\S]*z-index:\s*10020/);
  assert.match(source, /\.login-gate__sheet\s*\{[\s\S]*bottom:\s*0/);
  assert.match(source, /\.login-gate__sheet\s*\{[\s\S]*border-radius:\s*42rpx 42rpx 0 0/);
  assert.match(source, /\.login-gate__sheet\s*\{[\s\S]*min-height:\s*500rpx/);
});

test("custom tab bar can be fully hidden while the lobby login overlay is showing", () => {
  const source = fs.readFileSync(customTabBarWxmlPath, "utf8");

  assert.match(source, /wx:if=\"\{\{!hidden\}\}\"/);
});
