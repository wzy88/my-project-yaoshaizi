# Dice SFX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dice-room sound effects feel more natural, with a more realistic roll texture and less harsh confirmation/result tones.

**Architecture:** Keep the current in-code WAV synthesis pipeline so we do not add binary assets or change packaging. Update the synthesis envelopes and transient layering in `room.js`, and verify the generated files have the intended duration profile through a focused room-page test.

**Tech Stack:** WeChat Mini Program page script, in-memory WAV synthesis, Node test runner

---

### Task 1: Lock down generated SFX duration expectations

**Files:**
- Modify: `tests/room-mobile-entry.test.mjs`
- Test: `tests/room-mobile-entry.test.mjs`

- [ ] **Step 1: Write the failing test**

Add a room-page test that runs the real `ensureSfxFiles()` path with a fake mini program file system and asserts:
- `roll` writes a noticeably longer WAV than before
- `ok` is no longer ultra-short
- `open` remains longer than `ok`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/room-mobile-entry.test.mjs`
Expected: FAIL on the new SFX size assertions because the old generator still produces the shorter legacy buffers.

- [ ] **Step 3: Write minimal implementation**

Update the WAV synthesis helpers in `miniprogram/pages/room/room.js` so:
- `roll` uses a longer decay with layered low-pass noise and clustered impact transients
- `ok` and `open` use short percussive pulses instead of buzzy beeps
- `win` and `lose` become softer dual-tone feedback cues

- [ ] **Step 4: Run targeted test to verify it passes**

Run: `node --test tests/room-mobile-entry.test.mjs`
Expected: PASS, including the new sound-generation assertions.

- [ ] **Step 5: Run full verification**

Run: `npm test`
Expected: PASS
