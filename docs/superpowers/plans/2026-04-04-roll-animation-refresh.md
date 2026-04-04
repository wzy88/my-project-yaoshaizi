# Roll Animation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the self dice roll animation feel like a real shake sequence with a visible start, stronger motion, and a short settle.

**Architecture:** Keep the existing `myDiceRolling` flow, but switch the die layout to wrapper slots so the positioned slots stay fixed while the die images can rotate and bounce independently. Strengthen the cup and stack keyframes in CSS, and shorten the rolling timer in `room.js` so the motion matches the bundled shake audio.

**Tech Stack:** WeChat Mini Program WXML/WXSS, room page state machine, Node test runner

---

### Task 1: Lock the stronger roll animation structure

**Files:**
- Modify: `tests/room-entry-layout.test.mjs`
- Modify: `miniprogram/pages/room/room.wxml`
- Modify: `miniprogram/pages/room/room.wxss`
- Modify: `miniprogram/pages/room/room.js`

- [ ] **Step 1: Write the failing test**

Add a static layout test that asserts:
- the self dice render through `room-self__die-slot`
- the rolling CSS uses stronger transform-based keyframes for the cup, stack, and die image
- the roll duration constants in `room.js` are around one second instead of 2600ms

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/room-entry-layout.test.mjs`
Expected: FAIL because the current CSS still uses the old lightweight jitter and the long auto-peek timeout.

- [ ] **Step 3: Write minimal implementation**

Move die positioning to slot wrappers in WXML/WXSS, add stronger multi-step keyframes for cup/stack/die motion, and shorten the rolling interval + timeout in `room.js`.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `node --test tests/room-entry-layout.test.mjs tests/room-mobile-entry.test.mjs`
Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `npm test`
Expected: PASS
