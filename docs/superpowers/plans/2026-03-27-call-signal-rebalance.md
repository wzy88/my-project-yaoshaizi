# Call Signal Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the center-table call broadcast, keep distributed seat bubbles as the public signal surface, and add a low-priority self call hint in the bottom call area.

**Architecture:** Keep business state untouched and only rebalance presentation responsibilities in the room page. The WXML drops the center `table-call` block, `room.js` derives a self hint from the current player state, and WXSS adds a compact style for the new bottom hint.

**Tech Stack:** WeChat Mini Program (`room.wxml`, `room.js`, `room.wxss`), Node test runner (`node --test`)

---

### Task 1: Lock the display contract with a failing test

**Files:**
- Create: `tests/room-call-signal-layout.test.mjs`
- Test: `tests/room-call-signal-layout.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const roomWxmlPath = path.join(process.cwd(), "miniprogram/pages/room/room.wxml");
const roomJsPath = path.join(process.cwd(), "miniprogram/pages/room/room.js");

test("room call signals live on seats plus a self hint instead of a center broadcast", () => {
  const roomWxml = fs.readFileSync(roomWxmlPath, "utf8");
  const roomJs = fs.readFileSync(roomJsPath, "utf8");

  assert.doesNotMatch(roomWxml, /class="table-call"/);
  assert.match(roomWxml, /wx:if="\{\{selfCallHint\}\}" class="call-phase-panel__self-call"/);
  assert.match(roomJs, /const selfCallHint = self && self\.currentCall \? `上一手：\$\{self\.currentCall\.count\}个\$\{self\.currentCall\.point\}` : "";/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/room-call-signal-layout.test.mjs`
Expected: FAIL because `table-call` still exists and `selfCallHint` is not implemented.

- [ ] **Step 3: Write minimal implementation**

```js
const selfCallHint = self && self.currentCall ? `上一手：${self.currentCall.count}个${self.currentCall.point}` : "";
```

```xml
<text wx:if="{{selfCallHint}}" class="call-phase-panel__self-call">{{selfCallHint}}</text>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/room-call-signal-layout.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/room-call-signal-layout.test.mjs miniprogram/pages/room/room.wxml miniprogram/pages/room/room.js miniprogram/pages/room/room.wxss
git commit -m "feat: rebalance call signal display"
```

### Task 2: Rewire the room template and derived state

**Files:**
- Modify: `miniprogram/pages/room/room.wxml`
- Modify: `miniprogram/pages/room/room.js`
- Test: `tests/room-call-signal-layout.test.mjs`

- [ ] **Step 1: Remove the center broadcast block from the stage**

```xml
<!-- remove the table-call block entirely so the stage stays visually quiet -->
```

- [ ] **Step 2: Derive a self hint from the current player call**

```js
const selfCallHint = self && self.currentCall ? `上一手：${self.currentCall.count}个${self.currentCall.point}` : "";
```

- [ ] **Step 3: Bind the hint into the bottom call panel**

```xml
<text wx:if="{{selfCallHint}}" class="call-phase-panel__self-call">{{selfCallHint}}</text>
```

- [ ] **Step 4: Run the targeted test**

Run: `node --test tests/room-call-signal-layout.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/room/room.wxml miniprogram/pages/room/room.js tests/room-call-signal-layout.test.mjs
git commit -m "refactor: move call feedback out of stage center"
```

### Task 3: Style the self hint to stay low-priority

**Files:**
- Modify: `miniprogram/pages/room/room.wxss`
- Test: `tests/room-call-signal-layout.test.mjs`

- [ ] **Step 1: Add a subdued self hint style**

```css
.call-phase-panel__self-call {
  align-self: flex-start;
  margin-top: 16rpx;
  color: rgba(255, 255, 255, 0.58);
  font-size: 22rpx;
  line-height: 1.4;
}
```

- [ ] **Step 2: Keep the style low priority**

```css
/* no bright fills, borders, or glow; this line only confirms the player's own last public signal */
```

- [ ] **Step 3: Run the targeted test again**

Run: `node --test tests/room-call-signal-layout.test.mjs`
Expected: PASS

- [ ] **Step 4: Run existing room structure tests**

Run: `node --test tests/room-player-seat-glow.test.mjs tests/room-call-panel-layout.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/room/room.wxss tests/room-player-seat-glow.test.mjs tests/room-call-panel-layout.test.mjs tests/room-call-signal-layout.test.mjs
git commit -m "style: add subtle self call hint"
```
