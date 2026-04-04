import test from "node:test";
import assert from "node:assert/strict";

import { countPointWithOptions } from "../packages/shared/dist/index.js";

test("shared rules: straight counts as 0; leopard adds +1", () => {
  const allDice = [
    [1, 2, 3, 4, 5], // straight => contributes 0
    [4, 4, 4, 4, 4] // leopard of 4 => 5 + 1
  ];

  assert.equal(countPointWithOptions(allDice, 4, { oneAsWildcard: true }), 6);
  assert.equal(countPointWithOptions(allDice, 2, { oneAsWildcard: true }), 0);
});

test("shared rules: wildcard one counts for non-1 points only", () => {
  const allDice = [[1, 1, 2, 6, 6]];
  assert.equal(countPointWithOptions(allDice, 6, { oneAsWildcard: true }), 4);
  assert.equal(countPointWithOptions(allDice, 6, { oneAsWildcard: false }), 2);
  assert.equal(countPointWithOptions(allDice, 1, { oneAsWildcard: true }), 2);
});

test("shared rules: leopard of 1 adds +1 and can wildcard", () => {
  const allDice = [[1, 1, 1, 1, 1]]; // leopard of 1 => 6 ones
  assert.equal(countPointWithOptions(allDice, 1, { oneAsWildcard: true }), 6);
  assert.equal(countPointWithOptions(allDice, 2, { oneAsWildcard: true }), 6);
  assert.equal(countPointWithOptions(allDice, 2, { oneAsWildcard: false }), 0);
});

test("shared rules: wildcard one can complete a non-1 leopard when no one has called 1", () => {
  const allDice = [[5, 5, 5, 5, 1]];
  assert.equal(countPointWithOptions(allDice, 5, { oneAsWildcard: true }), 6);
  assert.equal(countPointWithOptions(allDice, 5, { oneAsWildcard: false }), 4);
});
