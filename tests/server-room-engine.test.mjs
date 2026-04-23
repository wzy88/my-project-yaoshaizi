import test from "node:test";
import assert from "node:assert/strict";

import { ErrorCode } from "../packages/shared/dist/index.js";
import { RoomEngine } from "../apps/server/dist/engine/room-engine.js";

function createEngine({ minOpeningCount = 2, wildcardOneEnabled = true } = {}) {
  const roomId = "T10001";
  const owner = { id: "P_OWNER", nickname: "owner", avatar: "" };
  const config = {
    direction: "cw",
    wildcardOneEnabled,
    openMode: "single",
    dicePerPlayer: 5,
    minOpeningCount,
    testMode: true
  };
  const engine = new RoomEngine(roomId, owner, config);
  engine.addPlayer({ id: "P_B", nickname: "b", avatar: "" });
  return engine;
}

test("room engine: startGame requires >=2 players and enters rolling", () => {
  const roomId = "T20001";
  const engine = new RoomEngine(roomId, { id: "P1", nickname: "p1", avatar: "" }, {
    direction: "cw",
    wildcardOneEnabled: true,
    openMode: "single",
    dicePerPlayer: 5,
    minOpeningCount: 2,
    testMode: true
  });

  assert.throws(() => engine.startGame("P1"), (err) => err && err.code === ErrorCode.BAD_REQUEST);

  engine.addPlayer({ id: "P2", nickname: "p2", avatar: "" });
  engine.startGame("P1");
  assert.equal(engine.getState().phase, "rolling");
});

test("room engine: roll capped at 5; lock prevents further roll", () => {
  const engine = createEngine();
  engine.startGame("P_OWNER");

  for (let i = 0; i < 5; i += 1) {
    const dice = engine.rollForPlayer("P_OWNER");
    assert.equal(dice.length, 5);
  }
  assert.throws(() => engine.rollForPlayer("P_OWNER"), (err) => err && err.code === ErrorCode.FORBIDDEN);

  engine.lockDice("P_OWNER");
  assert.throws(() => engine.rollForPlayer("P_OWNER"), (err) => err && err.code === ErrorCode.FORBIDDEN);
});

test("room engine: public room state exposes roll count this round", () => {
  const engine = createEngine();
  engine.startGame("P_OWNER");

  engine.rollForPlayer("P_OWNER");
  engine.rollForPlayer("P_OWNER");

  const owner = engine.getState().players.find((player) => player.id === "P_OWNER");
  assert.equal(owner && owner.rollCountThisRound, 2);
});

test("room engine: finishRolling auto-rolls and enters calling", () => {
  const engine = createEngine();
  engine.startGame("P_OWNER");

  // Only owner rolled; P_B will be auto-rolled and locked.
  engine.rollForPlayer("P_OWNER");
  engine.lockDice("P_OWNER");

  const { autoRolled } = engine.finishRolling("P_OWNER");
  assert.equal(engine.getState().phase, "calling");
  assert.ok(autoRolled.some((x) => x.playerId === "P_B"));

  const state = engine.getState();
  const b = state.players.find((p) => p.id === "P_B");
  assert.equal(Boolean(b && b.rollLocked), true);
});

test("room engine: enters calling automatically after everyone locks dice", () => {
  const engine = createEngine();
  engine.startGame("P_OWNER");

  engine.rollForPlayer("P_OWNER");
  engine.lockDice("P_OWNER");
  assert.equal(engine.getState().phase, "rolling");

  engine.rollForPlayer("P_B");
  engine.lockDice("P_B");

  const state = engine.getState();
  assert.equal(state.phase, "calling");
  assert.equal(state.currentPlayerId, "P_OWNER");
});

test("room engine: first call must respect minOpeningCount; calling 1 locks off wildcard", () => {
  const engine = createEngine({ minOpeningCount: 3, wildcardOneEnabled: true });
  engine.startGame("P_OWNER");

  // Auto-roll both into calling.
  engine.finishRolling("P_OWNER");
  const state1 = engine.getState();
  const first = state1.currentPlayerId;
  assert.ok(first);

  assert.throws(() => engine.makeCall(first, 2, 6), (err) => err && err.code === ErrorCode.INVALID_CALL);
  engine.makeCall(first, 3, 1);
  assert.equal(engine.getRuleOptionsForCurrentRound().oneAsWildcard, false);
});

test("room engine: openDice settles and loser starts next round", () => {
  const engine = createEngine({ minOpeningCount: 2, wildcardOneEnabled: true });
  engine.startGame("P_OWNER");

  // Force deterministic dice
  engine.setNextDice("P_OWNER", [2, 2, 3, 3, 3], "P_OWNER");
  engine.setNextDice("P_OWNER", [1, 4, 5, 6, 6], "P_B");

  engine.finishRolling("P_OWNER");
  const bidder = engine.getState().currentPlayerId;
  assert.ok(bidder);

  engine.makeCall(bidder, 2, 2);
  const opener = engine.getState().currentPlayerId;
  assert.ok(opener && opener !== bidder);

  const { openResult } = engine.openDice(opener, engine.getRuleOptionsForCurrentRound());
  assert.equal(openResult.targets.length, 1);
  assert.equal(openResult.targets[0].countDetails.length, 2);
  assert.equal(openResult.targets[0].countDetails[0].playerId, "P_OWNER");
  assert.equal(openResult.targets[0].countDetails[0].contribution, 2);
  assert.equal(openResult.targets[0].countDetails[1].playerId, "P_B");
  assert.equal(openResult.targets[0].countDetails[1].contribution, 1);

  const settled = engine.getState();
  assert.equal(settled.phase, "ended");
  // With the forced dice above, bidder wins => opener loses => opener starts next round.
  assert.equal(settled.currentPlayerId, opener);

  // Only loser can restart.
  assert.throws(() => engine.restartRound(bidder), (err) => err && err.code === ErrorCode.FORBIDDEN);
  engine.restartRound(opener);
  assert.equal(engine.getState().phase, "rolling");
});

test("room engine: settlement treats 5-5-5-5-1 as a 5 leopard while wildcard one remains active", () => {
  const engine = createEngine({ minOpeningCount: 2, wildcardOneEnabled: true });
  engine.startGame("P_OWNER");

  engine.setNextDice("P_OWNER", [5, 5, 5, 5, 1], "P_OWNER");
  engine.setNextDice("P_OWNER", [2, 3, 4, 6, 6], "P_B");

  engine.finishRolling("P_OWNER");
  const bidder = engine.getState().currentPlayerId;
  assert.equal(bidder, "P_OWNER");

  engine.makeCall(bidder, 6, 5);
  const opener = engine.getState().currentPlayerId;
  assert.equal(opener, "P_B");

  const { openResult } = engine.openDice(opener, engine.getRuleOptionsForCurrentRound());
  assert.equal(openResult.targets[0].actual, 6);
  assert.equal(openResult.targets[0].winnerId, "P_OWNER");
  assert.equal(openResult.targets[0].countDetails[0].leopardBonus, true);
  assert.equal(openResult.targets[0].countDetails[0].dice.find((die) => die.index === 4).wildcard, true);
});
