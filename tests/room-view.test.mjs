import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { resolveSeatCupToneClass } = require("../miniprogram/utils/room-view.js");

test("room view: opened remote cup uses jade tone", () => {
  assert.equal(resolveSeatCupToneClass({ diceCupStatus: "open" }), "is-jade");
});

test("room view: closed or invalid cup falls back to seat tone", () => {
  assert.equal(resolveSeatCupToneClass({ diceCupStatus: "closed" }), "is-slot");
  assert.equal(resolveSeatCupToneClass({ diceCupStatus: "unknown" }), "is-slot");
  assert.equal(resolveSeatCupToneClass(null), "is-slot");
});
