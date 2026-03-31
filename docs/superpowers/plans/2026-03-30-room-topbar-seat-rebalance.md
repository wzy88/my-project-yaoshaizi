# 房间顶部与杯位上提 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复房间页 6 位原始房间号展示与加入规则，并把顶部栏和 7 个非本人杯位整体调整到更贴合牌桌的视觉位置。

**Architecture:** 保持现有房间页的数据流和 8 槽位布局模型不变，只修正前端房间号格式化逻辑、加入校验、顶部栏样式和槽位坐标。先用测试锁定 6 位房间号与关键 DOM/样式约束，再做最小实现，避免再次发生“展示修了但加房失败”或“只动杯子没动头像/气泡”的回归。

**Tech Stack:** 微信小程序页面脚本/WXML/WXSS、Node `node:test` 测试、现有房间页状态机与布局表

---

### Task 1: 锁定 6 位房间号行为

**Files:**
- Modify: `tests/room-mobile-entry.test.mjs`
- Modify: `miniprogram/pages/lobby/lobby.js`
- Modify: `miniprogram/pages/room/room.js`

- [ ] **Step 1: 在房间页测试里先把 8 位补零预期改成 6 位原始值**

```js
assert.equal(page.data.roomId, "123456");
assert.equal(page.data.displayRoomId, "123456");
assert.equal(page.data.playerId, "player-a");
assert.equal(page.data.resumeToken, "resume-token");
assert.equal(page.data.joinRoomId, "123456");
```

同时把另一个 `room:state` 用例里的：

```js
assert.equal(page.data.displayRoomId, "00123456");
```

改成：

```js
assert.equal(page.data.displayRoomId, "123456");
```

- [ ] **Step 2: 运行单测，确认当前实现确实失败**

Run: `node --test tests/room-mobile-entry.test.mjs`

Expected: FAIL，断言里还能看到当前 `displayRoomId` 仍是 `00123456`

- [ ] **Step 3: 把房间页展示格式化从 8 位补零改为原始 6 位数字**

在 `miniprogram/pages/room/room.js` 中把：

```js
function formatRoomIdDisplay(roomId) {
  const digits = String(roomId || "").replace(/\D/g, "");
  if (!digits) {
    return "--------";
  }
  return digits.padStart(8, "0").slice(-8);
}
```

改成：

```js
function formatRoomIdDisplay(roomId) {
  const digits = String(roomId || "").replace(/\D/g, "");
  if (!digits) {
    return "------";
  }
  return digits.slice(0, 6);
}
```

并把 `data`、清空状态和重置状态里的默认值：

```js
displayRoomId: "--------",
```

统一改成：

```js
displayRoomId: "------",
```

- [ ] **Step 4: 在房间页 `joinRoom()` 增加 6 位数字校验，和大厅页保持一致**

在 `miniprogram/pages/room/room.js` 的 `joinRoom()` 入口最前面补上：

```js
const roomId = String(this.data.joinRoomId || "").trim();
if (!/^\d{6}$/.test(roomId)) {
  wx.showToast({ title: "房间不存在或房间号有误", icon: "none", duration: 5000 });
  return;
}
```

并将后续发送和排队统一改为使用 `roomId` 局部变量，避免旧值和格式化值混用。

- [ ] **Step 5: 再次运行房间页相关测试，确认 6 位规则通过**

Run: `node --test tests/room-mobile-entry.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一小段房间号修复**

```bash
git add tests/room-mobile-entry.test.mjs miniprogram/pages/room/room.js
git commit -m "fix: keep room ids at six digits"
```

### Task 2: 锁定大厅与房间顶部的结构约束

**Files:**
- Modify: `tests/room-entry-layout.test.mjs`
- Modify: `miniprogram/pages/room/room.wxml`

- [ ] **Step 1: 调整房间顶部结构测试，锁定当前这版必须保留的顶栏元素**

在 `tests/room-entry-layout.test.mjs` 中保留 `room-topbar__room` 和 `房间号:` 的断言，并把错误的旧断言：

```js
assert.match(source, /room-chrome-btn room-chrome-btn--menu" bindtap="onTapMore"/);
assert.doesNotMatch(source, /class="room-topbar__toggle"/);
```

改成明确要求左上菜单和右上切换都存在：

```js
assert.match(source, /room-chrome-btn room-chrome-btn--menu/);
assert.match(source, /class="room-topbar__toggle"/);
```

- [ ] **Step 2: 运行结构测试，确认当前测试预期和实现一致或仅有最小差异**

Run: `node --test tests/room-entry-layout.test.mjs`

Expected: PASS，或者只出现与当前顶栏结构相关的单点失败

- [ ] **Step 3: 如果测试失败，最小修正 `room.wxml` 顶栏结构，不改动交互绑定**

`miniprogram/pages/room/room.wxml` 顶栏结构应稳定为：

```xml
<view class="room-topbar">
  <view class="room-topbar__corner">
    <view class="room-chrome-btn room-chrome-btn--menu" bindtap="toggleCornerPanel">
      <image class="room-chrome-btn__icon" ... />
    </view>
  </view>

  <view class="room-topbar__center">
    <view wx:if="{{roomId}}" class="room-topbar__room {{roomId ? 'is-copyable' : ''}}" bindtap="copyRoomId">
      <text class="room-topbar__room-label">房间号:</text>
      <text class="room-topbar__room-value">{{displayRoomId}}</text>
    </view>
  </view>

  <view class="room-topbar__corner room-topbar__corner--right">
    <view class="room-topbar__toggle" bindtap="onTapMore">...</view>
  </view>
</view>
```

- [ ] **Step 4: 重新运行结构测试**

Run: `node --test tests/room-entry-layout.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交结构测试与必要模板修复**

```bash
git add tests/room-entry-layout.test.mjs miniprogram/pages/room/room.wxml
git commit -m "test: lock room topbar structure"
```

### Task 3: 实现顶部栏贴桌对齐

**Files:**
- Modify: `miniprogram/pages/room/room.wxss`
- Modify: `miniprogram/pages/room/room.wxml`

- [ ] **Step 1: 先把顶栏现有“人为下沉”的样式去掉**

在 `miniprogram/pages/room/room.wxss` 中删除或覆盖这类偏移：

```css
.room-chrome-btn--menu {
  margin-top: 64rpx;
}

.room-topbar__room {
  margin-top: 14rpx;
}
```

目标是让三块内容共享同一条顶线，而不是各自手动下沉。

- [ ] **Step 2: 把顶栏容器改成围绕牌桌顶边对齐**

将相关样式整理为类似：

```css
.room-topbar {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 92rpx);
  left: 24rpx;
  right: 24rpx;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8rpx;
}

.room-topbar__center {
  flex: 1;
  min-height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

这里的 `top` 数值要围绕当前牌桌 `top: 78rpx` 的可视位置微调，原则是“视觉内切到牌桌左上角”，不是机械贴边。

- [ ] **Step 3: 收紧房间号文字样式，保证居中时不显松散**

将房间号保持为单行居中：

```css
.room-topbar__room {
  margin-top: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
}

.room-topbar__room-value {
  font-weight: 700;
  letter-spacing: 2rpx;
}
```

- [ ] **Step 4: 运行结构测试和房间页测试，确保顶栏改动没有破坏现有渲染**

Run: `node --test tests/room-entry-layout.test.mjs tests/room-mobile-entry.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交顶部栏对齐样式**

```bash
git add miniprogram/pages/room/room.wxss miniprogram/pages/room/room.wxml tests/room-entry-layout.test.mjs tests/room-mobile-entry.test.mjs
git commit -m "style: align room topbar with table edge"
```

### Task 4: 上提 7 个非本人杯位并联动头像/气泡

**Files:**
- Modify: `miniprogram/pages/room/room.js`
- Modify: `miniprogram/pages/room/room.wxss`

- [ ] **Step 1: 在布局表里一次性上提非本人槽位，不改布局算法**

在 `miniprogram/pages/room/room.js` 的 `getStitchSeatLayout()` 中，只调整 `figmaShellSlots` 坐标，不改 `occupiedSlotIndicesMap`。目标是把 `slot-upper-left` 到 `slot-lower-right` 的 `y / by / cupY` 整体上提，示意如下：

```js
const figmaShellSlots = [
  { x: 187.5, y: 182, bx: 242, by: 188, cupX: 187.5, cupY: 232.5, cupAlign: "bottom", slotClass: "slot-top" },
  { x: 32, y: 286, bx: 79, by: 246, cupX: 99, cupY: 286, cupAlign: "right", slotClass: "slot-upper-left" },
  { x: 343, y: 286, bx: 297, by: 246, cupX: 278, cupY: 286, cupAlign: "left", slotClass: "slot-upper-right" },
  { x: 31, y: 410, bx: 79, by: 374, cupX: 101, cupY: 386, cupAlign: "right", slotClass: "slot-mid-left" },
  { x: 344, y: 410, bx: 296, by: 374, cupX: 274, cupY: 386, cupAlign: "left", slotClass: "slot-mid-right" },
  { x: 31, y: 536, bx: 79, by: 500, cupX: 101, cupY: 510, cupAlign: "right", slotClass: "slot-lower-left" },
  { x: 344, y: 536, bx: 296, by: 500, cupX: 274, cupY: 510, cupAlign: "left", slotClass: "slot-lower-right" },
  { x: 187.5, y: 792, bx: 187.5, by: 724, cupX: 187.5, cupY: 724, cupAlign: "top", slotClass: "slot-bottom" }
];
```

可以微调，但必须保持“头像、杯位、气泡三点一起动”。

- [ ] **Step 2: 如果上提后顶部或下部空间失衡，微调牌桌水印和本人主位间距**

仅在必要时调整这些低风险样式：

```css
.room-stage__watermark {
  top: 360rpx;
}

.room-self {
  margin-top: 12rpx;
}
```

不要改本人骰盅内部结构，不要重排底部操作区。

- [ ] **Step 3: 检查叫牌气泡箭头方向是否仍匹配**

保持现有 `.seat__bubble--slot-*::after` 逻辑不变；若上提后某个槽位气泡被牌桌边缘压住，只允许通过 `bx/by` 微调解决，不重写箭头方向规则。

- [ ] **Step 4: 运行现有房间页相关测试，确保布局表改动没有破坏状态处理**

Run: `node --test tests/room-entry-layout.test.mjs tests/room-mobile-entry.test.mjs tests/room-call-signal-layout.test.mjs tests/room-call-panel-layout.test.mjs`

Expected: PASS

- [ ] **Step 5: 手工检查 8 人房与少人房布局**

Run: `npm test -- --runInBand` 如果仓库测试入口可用；否则至少在开发者工具里进入房间页，检查：

```text
1. 顶部房间号是否为 6 位原值
2. 左上按钮、房间号、右上按钮是否共线
3. 上半张桌子是否能明显看到多位杯位
4. 杯子、头像、叫牌气泡是否仍成组
```

- [ ] **Step 6: 提交杯位上提实现**

```bash
git add miniprogram/pages/room/room.js miniprogram/pages/room/room.wxss
git commit -m "style: raise non-self room seats"
```

### Task 5: 最终回归与收尾

**Files:**
- Modify: `tests/room-mobile-entry.test.mjs`
- Modify: `tests/room-entry-layout.test.mjs`
- Modify: `miniprogram/pages/lobby/lobby.js`
- Modify: `miniprogram/pages/room/room.js`
- Modify: `miniprogram/pages/room/room.wxml`
- Modify: `miniprogram/pages/room/room.wxss`

- [ ] **Step 1: 运行本次修改覆盖到的所有关键测试**

Run: `node --test tests/room-mobile-entry.test.mjs tests/room-entry-layout.test.mjs tests/room-call-signal-layout.test.mjs tests/room-call-panel-layout.test.mjs`

Expected: 全部 PASS

- [ ] **Step 2: 查看最终 diff，确认没有误碰无关功能**

Run: `git diff -- miniprogram/pages/lobby/lobby.js miniprogram/pages/room/room.js miniprogram/pages/room/room.wxml miniprogram/pages/room/room.wxss tests/room-mobile-entry.test.mjs tests/room-entry-layout.test.mjs`

Expected: 只出现 6 位房间号、顶部栏对齐、杯位坐标和相关测试改动

- [ ] **Step 3: 整体提交**

```bash
git add miniprogram/pages/lobby/lobby.js miniprogram/pages/room/room.js miniprogram/pages/room/room.wxml miniprogram/pages/room/room.wxss tests/room-mobile-entry.test.mjs tests/room-entry-layout.test.mjs
git commit -m "fix: rebalance room topbar and seat layout"
```
