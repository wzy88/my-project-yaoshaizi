# Round Start SFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the provided bundled audio once when each round actually begins on the server.

**Architecture:** Add the new MP3 as a bundled room audio asset and trigger playback from the `room:state` transition into `rolling`. Gate it by prior room-state receipt plus round key tracking so repeated rolling-state refreshes do not replay the cue.

**Tech Stack:** WeChat Mini Program page script, bundled MP3 assets, Node test runner

---

### Task 1: Verify one-shot round-start playback

**Files:**
- Create: `miniprogram/assets/audio/round-start.mp3`
- Modify: `miniprogram/pages/room/room.js`
- Modify: `tests/room-mobile-entry.test.mjs`

- [ ] **Step 1: Write the failing test**

Add a room-page test that feeds:
- one `room:state` in `ready`
- one `room:state` in `rolling` for round 1
- one repeated `room:state` in `rolling` for round 1

and asserts the page only plays `roundStart` once.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/room-mobile-entry.test.mjs`
Expected: FAIL because no bundled round-start cue is registered yet.

- [ ] **Step 3: Write minimal implementation**

Copy the provided MP3 into the mini program assets, register it in `ROOM_AUDIO_ASSETS`, and add guarded playback in the `room:state` handler when the page transitions into a new rolling round.

- [ ] **Step 4: Run targeted test to verify it passes**

Run: `node --test tests/room-mobile-entry.test.mjs`
Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `npm test`
Expected: PASS
