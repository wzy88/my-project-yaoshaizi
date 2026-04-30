import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const indexWxmlPath = path.join(projectRoot, "miniprogram/pages/index/index.wxml");
const lobbyWxmlPath = path.join(projectRoot, "miniprogram/pages/lobby/lobby.wxml");
const meWxmlPath = path.join(projectRoot, "miniprogram/pages/me/me.wxml");
const runtimeConfigPath = path.join(projectRoot, "miniprogram/utils/runtime-backend-config.js");

test("product entry pages no longer expose cloud container configuration actions", () => {
  const indexWxml = fs.readFileSync(indexWxmlPath, "utf8");
  const lobbyWxml = fs.readFileSync(lobbyWxmlPath, "utf8");
  const meWxml = fs.readFileSync(meWxmlPath, "utf8");

  assert.doesNotMatch(indexWxml, /配置云托管/);
  assert.doesNotMatch(lobbyWxml, /配置云托管/);
  assert.doesNotMatch(meWxml, /云托管设置/);
  assert.doesNotMatch(meWxml, /点击配置云托管/);
});

test("runtime backend target is defined in the internal config module instead of user-facing pages", () => {
  const source = fs.readFileSync(runtimeConfigPath, "utf8");

  assert.match(source, /FIXED_RUNTIME_CONNECTION/);
  assert.match(source, /固定运行时连接目标/);
  assert.match(source, /clearLegacyRuntimeConnectionStorage/);
  assert.match(source, /envId:\s*"prod-5gy76rw610720f84"/);
  assert.match(source, /service:\s*"express-rw1k"/);
  assert.match(source, /wsPath:\s*"\/ws"/);
});
