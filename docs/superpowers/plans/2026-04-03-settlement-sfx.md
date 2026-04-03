# Settlement SFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the provided bundled audio when the settlement dialog first appears after opening dice, without replaying it on settlement refreshes.

**Architecture:** Add the new settlement MP3 as a bundled mini program asset and route it through the existing `playSfx()` infrastructure. Trigger playback inside `showSettlementPanel()` only on the first visible transition, and remove the legacy per-player `win/lose` playback from `open:result` so sounds do not stack.

**Tech Stack:** WeChat Mini Program page script, bundled MP3 assets, Node test runner

---

### Task 1: Verify first-show-only settlement playback

**Files:**
- Modify: `tests/room-mobile-entry.test.mjs`
- Modify: `miniprogram/pages/room/room.js`
- Create: `miniprogram/assets/audio/settlement.mp3`

- [ ] **Step 1: Write the failing test**

Add a room-page test that stubs `playSfx()` and verifies:
- first `showSettlementPanel()` call plays `settlement`
- second refresh call for the same dialog does not replay it
- `open:result` no longer emits `win/lose`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/room-mobile-entry.test.mjs`
Expected: FAIL because the page still uses `win/lose` during `open:result` and has no dedicated `settlement` asset path.

- [ ] **Step 3: Write minimal implementation**

Copy the provided MP3 into `miniprogram/assets/audio/settlement.mp3`, register it in the room audio asset map, trigger it only on the first `settlementVisible` transition, and remove `win/lose` playback from the `open:result` branch.

- [ ] **Step 4: Run targeted test to verify it passes**

Run: `node --test tests/room-mobile-entry.test.mjs`
Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `npm test`
Expected: PASS
