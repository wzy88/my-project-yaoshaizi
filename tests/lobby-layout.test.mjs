import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const lobbyWxmlPath = path.join(process.cwd(), "miniprogram/pages/lobby/lobby.wxml");
const lobbyWxssPath = path.join(process.cwd(), "miniprogram/pages/lobby/lobby.wxss");

test("lobby status chrome keeps only the signal indicator on the right", () => {
  const wxml = fs.readFileSync(lobbyWxmlPath, "utf8");
  const wxss = fs.readFileSync(lobbyWxssPath, "utf8");

  assert.match(wxml, /<text class="hero-title">满上，<\/text>/);
  assert.match(wxml, /<text class="hero-title">来一局<\/text>/);
  assert.match(wxml, /class="status-right"/);
  assert.match(wxml, /class="status-signal"/);
  assert.doesNotMatch(wxml, /class="status-pill"/);
  assert.doesNotMatch(wxml, /···/);

  assert.match(wxss, /\.status-right\s*\{/);
  assert.match(wxss, /\.status-signal\s*\{/);
  assert.doesNotMatch(wxss, /\.status-pill\s*\{/);
});
