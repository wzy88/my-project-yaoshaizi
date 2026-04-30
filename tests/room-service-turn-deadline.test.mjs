import test from "node:test";
import assert from "node:assert/strict";

import { CALL_TIMEOUT_MS } from "../apps/server/dist/config.js";
import { RoomEngine } from "../apps/server/dist/engine/room-engine.js";
import { RoomService } from "../apps/server/dist/engine/room-service.js";

function createCallingRoom(roomId = "T90001") {
  const room = new RoomEngine(roomId, { id: "P1", nickname: "p1", avatar: "" }, {
    direction: "cw",
    wildcardOneEnabled: true,
    openMode: "single",
    dicePerPlayer: 5,
    minOpeningCount: 2,
    testMode: true
  });
  room.addPlayer({ id: "P2", nickname: "p2", avatar: "" });
  room.startGame("P1");
  room.finishRolling("P1");
  return room;
}

test("room service: calling turn state broadcasts a fresh deadline before clients reset countdown", () => {
  const roomId = "T90001";
  const service = new RoomService();
  const room = createCallingRoom(roomId);
  const roomStatePayloads = [];

  service.rooms.set(roomId, room);
  service.broadcastRoom = (sentRoomId, event, payload) => {
    if (sentRoomId === roomId && event === "room:state") {
      roomStatePayloads.push(payload);
    }
  };

  try {
    service.broadcastRoomState(roomId);
    assert.equal(roomStatePayloads.length, 1);
    assert.ok(roomStatePayloads[0].turnDeadlineTs, "first calling state should include a deadline");

    const firstCaller = room.getState().currentPlayerId;
    room.makeCall(firstCaller, 2, 2);

    service.turnDeadlineTsByRoom.set(roomId, Date.now() + 13000);
    service.broadcastRoomState(roomId);

    const nextTurnState = roomStatePayloads.at(-1);
    const remainingMs = nextTurnState.turnDeadlineTs - nextTurnState.serverTs;
    assert.ok(
      remainingMs >= CALL_TIMEOUT_MS - 500,
      `expected a fresh ${CALL_TIMEOUT_MS}ms deadline, got ${remainingMs}ms`
    );
  } finally {
    service.cleanupRoomResources(roomId);
  }
});
