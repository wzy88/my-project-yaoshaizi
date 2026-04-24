import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const meWxmlPath = path.join(process.cwd(), "miniprogram/pages/me/me.wxml");
const meWxssPath = path.join(process.cwd(), "miniprogram/pages/me/me.wxss");
const meJsonPath = path.join(process.cwd(), "miniprogram/pages/me/me.json");

test("me page keeps the profile and nickname area fixed while only the lower content scrolls", () => {
  const wxml = fs.readFileSync(meWxmlPath, "utf8");
  const wxss = fs.readFileSync(meWxssPath, "utf8");
  const json = JSON.parse(fs.readFileSync(meJsonPath, "utf8"));

  assert.match(wxml, /<view class="me-shell">/);
  assert.match(wxml, /maxlength="5"/);
  assert.match(wxml, /bindtap="onToggleTurnAlertSfx"/);
  assert.match(wxml, /<text class="row-label">叫牌提醒<\/text>/);
  assert.match(wxml, /<view class="me-header">/);
  assert.match(wxml, /<scroll-view class="me-body-scroll" scroll-y="true" enhanced="true" show-scrollbar="false">/);
  assert.match(wxml, /<view class="me-body-scroll__content">/);
  assert.doesNotMatch(wxml, /<scroll-view class="me-scroll"/);

  assert.equal(json.disableScroll, true);
  assert.match(wxss, /page\s*\{[\s\S]*height:\s*100%[\s\S]*overflow:\s*hidden/);
  assert.match(wxss, /\.me-page\s*\{[\s\S]*height:\s*100%/);
  assert.match(wxss, /\.me-shell\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(wxss, /\.me-header\s*\{[\s\S]*flex-shrink:\s*0/);
  assert.match(wxss, /\.me-body-scroll\s*\{[\s\S]*flex:\s*1/);
  assert.match(wxss, /\.me-body-scroll__content\s*\{[\s\S]*padding-bottom:\s*calc\(96rpx \+ env\(safe-area-inset-bottom\)\)/);
});

test("me page exposes a real contact email instead of a dead customer-service row", () => {
  const wxml = fs.readFileSync(meWxmlPath, "utf8");

  assert.match(wxml, /bindtap="copyContactEmail"/);
  assert.match(wxml, /<text class="row-label">联系邮箱<\/text>/);
  assert.match(wxml, /\{\{contactEmail\}\}/);
  assert.match(wxml, /<text class="row-arrow">复制<\/text>/);
  assert.doesNotMatch(wxml, /<text class="row-label">联系客服<\/text>/);
});
