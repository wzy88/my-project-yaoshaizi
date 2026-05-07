import test from "node:test";
import assert from "node:assert/strict";

import { RoomService } from "../apps/server/dist/engine/room-service.js";

function createSocket(label) {
  const packets = [];
  return {
    label,
    readyState: 1,
    send(raw) {
      packets.push(JSON.parse(String(raw)));
    },
    close() {
      this.readyState = 3;
    },
    packets
  };
}

function getAck(socket, actionId) {
  return socket.packets.find((packet) => (
    packet.event === "action:ack" && packet.payload.actionId === actionId
  ))?.payload;
}

function createRoomPayload() {
  return {
    nickname: "房主",
    avatar: "",
    config: {
      direction: "cw",
      wildcardOneEnabled: true,
      openMode: "single",
      dicePerPlayer: 5,
      minOpeningCount: 2,
      testMode: false,
      themeId: "ruby-red"
    }
  };
}

async function enterCallingPhase(service, ownerSocket, guestSocket) {
  await service.handleRoomCreate(ownerSocket, createRoomPayload(), "create-1");
  const createAck = getAck(ownerSocket, "create-1");
  assert.equal(createAck.ok, true);

  await service.handleRoomJoin(guestSocket, {
    roomId: createAck.roomId,
    nickname: "玩家2",
    avatar: ""
  }, "join-1");
  const joinAck = getAck(guestSocket, "join-1");
  assert.equal(joinAck.ok, true);

  const room = service.rooms.get(createAck.roomId);
  room.startGame(createAck.playerId);
  room.finishRolling(createAck.playerId);

  ownerSocket.packets.length = 0;
  guestSocket.packets.length = 0;

  return {
    roomId: createAck.roomId,
    ownerPlayerId: createAck.playerId,
    guestPlayerId: joinAck.playerId
  };
}

function withMockedNow(values, fn) {
  const original = Date.now;
  const queue = Array.isArray(values) ? [...values] : [values];
  let lastValue = queue.length ? Number(queue[queue.length - 1]) : original();
  Date.now = () => {
    if (queue.length) {
      lastValue = Number(queue.shift());
    }
    return lastValue;
  };

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      Date.now = original;
    });
}

test("room service: voice upload triggers a server transcript for the same player", async () => {
  const ownerSocket = createSocket("owner");
  const guestSocket = createSocket("guest");
  const transcriber = {
    isEnabled() {
      return true;
    },
    async transcribe() {
      return "6个4";
    }
  };
  const service = new RoomService(undefined, transcriber);
  const session = await enterCallingPhase(service, ownerSocket, guestSocket);

  ownerSocket.packets.length = 0;

  await withMockedNow([1000, 1001], async () => {
    await service.handleVoiceUpload(ownerSocket, {
      fileName: "voice.mp3",
      mimeType: "audio/mpeg",
      durationMs: 1200,
      base64: Buffer.from("fake-audio").toString("base64"),
      clientRequestId: "voice-local-1"
    }, "upload-1");
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  const uploadAck = getAck(ownerSocket, "upload-1");
  assert.equal(uploadAck.ok, true);

  const transcribed = ownerSocket.packets.find((packet) => packet.event === "voice:transcribed")?.payload;
  assert.equal(transcribed.ok, true);
  assert.equal(transcribed.text, "6个4");
  assert.equal(transcribed.count, 6);
  assert.equal(transcribed.point, 4);
  assert.equal(transcribed.clientRequestId, "voice-local-1");
  assert.equal(transcribed.playerId, session.ownerPlayerId);
  assert.equal(transcribed.roomId, session.roomId);
});

test("room service: disabled voice transcriber returns a clear failure reason", async () => {
  const ownerSocket = createSocket("owner");
  const guestSocket = createSocket("guest");
  const transcriber = {
    isEnabled() {
      return false;
    },
    async transcribe() {
      throw new Error("should not be called");
    }
  };
  const service = new RoomService(undefined, transcriber);
  await enterCallingPhase(service, ownerSocket, guestSocket);

  ownerSocket.packets.length = 0;

  await withMockedNow([2000, 2001], async () => {
    await service.handleVoiceUpload(ownerSocket, {
      fileName: "voice.mp3",
      mimeType: "audio/mpeg",
      durationMs: 1200,
      base64: Buffer.from("fake-audio").toString("base64"),
      clientRequestId: "voice-local-2"
    }, "upload-2");
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  const transcribed = ownerSocket.packets.find((packet) => packet.event === "voice:transcribed")?.payload;
  assert.equal(transcribed.ok, false);
  assert.equal(transcribed.reason, "语音识别服务未配置");
  assert.equal(transcribed.clientRequestId, "voice-local-2");
});

test("room service: voice upload is rejected outside the caller's turn", async () => {
  const ownerSocket = createSocket("owner");
  const guestSocket = createSocket("guest");
  const transcriber = {
    isEnabled() {
      return true;
    },
    async transcribe() {
      return "6个4";
    }
  };
  const service = new RoomService(undefined, transcriber);
  await enterCallingPhase(service, ownerSocket, guestSocket);

  await assert.rejects(
    () => service.handleVoiceUpload(guestSocket, {
      fileName: "voice.mp3",
      mimeType: "audio/mpeg",
      durationMs: 1200,
      base64: Buffer.from("fake-audio").toString("base64"),
      clientRequestId: "voice-local-3"
    }, "upload-3"),
    (error) => error && error.code === "NOT_YOUR_TURN" && /仅轮到你叫牌时可语音/.test(error.message)
  );
});

test("room service: three invalid transcripts lock voice for the rest of the turn", async () => {
  const ownerSocket = createSocket("owner");
  const guestSocket = createSocket("guest");
  const transcriber = {
    isEnabled() {
      return true;
    },
    async transcribe() {
      return "我先随便说两句";
    }
  };
  const service = new RoomService(undefined, transcriber);
  await enterCallingPhase(service, ownerSocket, guestSocket);

  const tryUploadAt = async (at, actionId, requestId) => {
    ownerSocket.packets.length = 0;
    await withMockedNow([at, at + 1], async () => {
      await service.handleVoiceUpload(ownerSocket, {
        fileName: "voice.mp3",
        mimeType: "audio/mpeg",
        durationMs: 1200,
        base64: Buffer.from("fake-audio").toString("base64"),
        clientRequestId: requestId
      }, actionId);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return ownerSocket.packets.find((packet) => packet.event === "voice:transcribed")?.payload;
  };

  const first = await tryUploadAt(5000, "upload-4-1", "voice-local-4-1");
  assert.equal(first.ok, false);
  assert.equal(first.invalidStreak, 1);
  assert.equal(first.disabledForTurn, false);

  const second = await tryUploadAt(9000, "upload-4-2", "voice-local-4-2");
  assert.equal(second.ok, false);
  assert.equal(second.invalidStreak, 2);
  assert.equal(second.disabledForTurn, false);

  const third = await tryUploadAt(13000, "upload-4-3", "voice-local-4-3");
  assert.equal(third.ok, false);
  assert.equal(third.invalidStreak, 3);
  assert.equal(third.disabledForTurn, true);

  await withMockedNow(17000, async () => {
    await assert.rejects(
      () => service.handleVoiceUpload(ownerSocket, {
        fileName: "voice.mp3",
        mimeType: "audio/mpeg",
        durationMs: 1200,
        base64: Buffer.from("fake-audio").toString("base64"),
        clientRequestId: "voice-local-4-4"
      }, "upload-4-4"),
      (error) => error && error.code === "LOCKED" && /本轮请直接手动叫牌/.test(error.message)
    );
  });
});
