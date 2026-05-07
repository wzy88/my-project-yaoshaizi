import test from "node:test";
import assert from "node:assert/strict";

import { RoomService } from "../apps/server/dist/engine/room-service.js";

function createSocket(label) {
  const packets = [];
  return {
    label,
    readyState: 1,
    closeCount: 0,
    send(raw) {
      packets.push(JSON.parse(String(raw)));
    },
    close() {
      this.closeCount += 1;
      this.readyState = 3;
    },
    packets
  };
}

function createAccountStore() {
  const touchedRooms = [];
  return {
    touchedRooms,
    async verifySession(accountId, sessionToken) {
      if (accountId !== "acct-shared" || sessionToken !== "token-shared") {
        return null;
      }
      return {
        accountId: "acct-shared",
        displayId: "WX-SHARED",
        nickname: "共享账号",
        avatarUrl: "/avatar.png"
      };
    },
    async touchRoom(accountId, roomId, role) {
      touchedRooms.push({ accountId, roomId, role });
    }
  };
}

function getAck(socket, actionId) {
  return socket.packets.find((packet) => (
    packet.event === "action:ack" && packet.payload.actionId === actionId
  ))?.payload;
}

function getRoomState(socket) {
  return socket.packets.filter((packet) => packet.event === "room:state").at(-1)?.payload;
}

function createRoomPayload(themeId = "ruby-red") {
  return {
    nickname: "手机房主",
    avatar: "",
    accountId: "acct-shared",
    accountSessionToken: "token-shared",
    config: {
      direction: "cw",
      wildcardOneEnabled: true,
      openMode: "single",
      dicePerPlayer: 5,
      minOpeningCount: 2,
      testMode: false,
      themeId
    }
  };
}

test("room service: same online account joining reuses the existing player socket", async () => {
  const accountStore = createAccountStore();
  const service = new RoomService(accountStore);
  const ownerSocket = createSocket("mobile");
  const joinSocket = createSocket("devtools");

  await service.handleRoomCreate(ownerSocket, createRoomPayload("ruby-red"), "create-1");
  const createAck = getAck(ownerSocket, "create-1");
  assert.equal(createAck.ok, true);
  assert.equal(createAck.themeId, "ruby-red");

  await service.handleRoomJoin(joinSocket, {
    roomId: createAck.roomId,
    nickname: "调试器玩家",
    avatar: "",
    accountId: "acct-shared",
    accountSessionToken: "token-shared"
  }, "join-1");

  const joinAck = getAck(joinSocket, "join-1");
  assert.equal(joinAck.ok, true);
  assert.equal(joinAck.roomId, createAck.roomId);
  assert.equal(joinAck.themeId, "ruby-red");
  assert.equal(joinAck.playerId, createAck.playerId);
  assert.equal(ownerSocket.closeCount, 1);

  const ownerState = getRoomState(ownerSocket);
  const joinState = getRoomState(joinSocket);
  assert.equal(ownerState.roomId, createAck.roomId);
  assert.equal(joinState.roomId, createAck.roomId);
  assert.equal(ownerState.config.themeId, "ruby-red");
  assert.equal(joinState.config.themeId, "ruby-red");
  assert.equal(ownerState.players.length, 1);
  assert.equal(joinState.players.length, 1);

  const joined = joinState.players.find((player) => player.id === joinAck.playerId);
  assert.equal(joined.nickname, "调试器玩家");
  assert.equal(joined.accountId, "acct-shared");
});

test("room service: debug multi-join can keep same-account mobile and devtools in one room", async () => {
  const accountStore = createAccountStore();
  const service = new RoomService(accountStore, undefined, {
    allowSameAccountMultiJoin: true
  });
  const ownerSocket = createSocket("mobile");
  const joinSocket = createSocket("devtools");

  await service.handleRoomCreate(ownerSocket, createRoomPayload("ruby-red"), "create-1");
  const createAck = getAck(ownerSocket, "create-1");
  assert.equal(createAck.ok, true);

  await service.handleRoomJoin(joinSocket, {
    roomId: createAck.roomId,
    nickname: "调试器玩家",
    avatar: "",
    accountId: "acct-shared",
    accountSessionToken: "token-shared"
  }, "join-1");

  const joinAck = getAck(joinSocket, "join-1");
  assert.equal(joinAck.ok, true);
  assert.notEqual(joinAck.playerId, createAck.playerId);
  assert.equal(ownerSocket.closeCount, 0);

  const joinState = getRoomState(joinSocket);
  assert.equal(joinState.players.length, 2);
  assert.equal(joinState.players.filter((player) => player.id === createAck.playerId).length, 1);
  assert.equal(joinState.players.filter((player) => player.id === joinAck.playerId).length, 1);
});

test("room service: same account can still restore an offline participant", async () => {
  const accountStore = createAccountStore();
  const service = new RoomService(accountStore);
  const ownerSocket = createSocket("mobile");
  const restoreSocket = createSocket("resume");

  await service.handleRoomCreate(ownerSocket, createRoomPayload("ruby-red"), "create-1");
  const createAck = getAck(ownerSocket, "create-1");
  const room = service.rooms.get(createAck.roomId);
  room.setPlayerOnlineStatus(createAck.playerId, "offline");
  service.sessions.delete(ownerSocket);
  service.socketsByPlayerKey.delete(`${createAck.roomId}:${createAck.playerId}`);

  await service.handleRoomJoin(restoreSocket, {
    roomId: createAck.roomId,
    nickname: "恢复玩家",
    avatar: "",
    accountId: "acct-shared",
    accountSessionToken: "token-shared"
  }, "join-1");

  const joinAck = getAck(restoreSocket, "join-1");
  assert.equal(joinAck.ok, true);
  assert.equal(joinAck.playerId, createAck.playerId);

  const restoredState = getRoomState(restoreSocket);
  assert.equal(restoredState.players.length, 1);
  assert.equal(restoredState.players[0].onlineStatus, "online");
  assert.equal(restoredState.players[0].accountId, "acct-shared");
});

test("room service: debug multi-join still restores the offline participant instead of duplicating it", async () => {
  const accountStore = createAccountStore();
  const service = new RoomService(accountStore, undefined, {
    allowSameAccountMultiJoin: true
  });
  const ownerSocket = createSocket("mobile");
  const restoreSocket = createSocket("resume");

  await service.handleRoomCreate(ownerSocket, createRoomPayload("ruby-red"), "create-1");
  const createAck = getAck(ownerSocket, "create-1");
  const room = service.rooms.get(createAck.roomId);
  room.setPlayerOnlineStatus(createAck.playerId, "offline");
  service.sessions.delete(ownerSocket);
  service.socketsByPlayerKey.delete(`${createAck.roomId}:${createAck.playerId}`);

  await service.handleRoomJoin(restoreSocket, {
    roomId: createAck.roomId,
    nickname: "恢复玩家",
    avatar: "",
    accountId: "acct-shared",
    accountSessionToken: "token-shared"
  }, "join-1");

  const joinAck = getAck(restoreSocket, "join-1");
  assert.equal(joinAck.ok, true);
  assert.equal(joinAck.playerId, createAck.playerId);

  const restoredState = getRoomState(restoreSocket);
  assert.equal(restoredState.players.length, 1);
  assert.equal(restoredState.players[0].onlineStatus, "online");
});

test("room service: resume token rejoin restores the same player without duplicating around waiting users", async () => {
  const accountStore = createAccountStore();
  const service = new RoomService(accountStore);
  const ownerSocket = createSocket("mobile");
  const guestSocket = createSocket("guest");
  const waitingSocket = createSocket("waiting");
  const resumeSocket = createSocket("resume");

  await service.handleRoomCreate(ownerSocket, createRoomPayload("ruby-red"), "create-1");
  const createAck = getAck(ownerSocket, "create-1");

  await service.handleRoomJoin(guestSocket, {
    roomId: createAck.roomId,
    nickname: "二号玩家",
    avatar: ""
  }, "join-guest");

  service.handleGameStart(ownerSocket, "start-1");

  await service.handleRoomJoin(waitingSocket, {
    roomId: createAck.roomId,
    nickname: "等待玩家",
    avatar: ""
  }, "join-waiting");

  const beforeDisconnect = getRoomState(ownerSocket);
  assert.equal(beforeDisconnect.players.length, 2);
  assert.equal(beforeDisconnect.spectators.length, 1);

  service.handleSocketDisconnected(ownerSocket);

  service.handleRoomRejoin(resumeSocket, {
    roomId: createAck.roomId,
    playerId: createAck.playerId,
    resumeToken: createAck.resumeToken
  }, "rejoin-1");

  const rejoinAck = getAck(resumeSocket, "rejoin-1");
  assert.equal(rejoinAck.ok, true);
  assert.equal(rejoinAck.playerId, createAck.playerId);
  assert.equal(rejoinAck.themeId, "ruby-red");

  const afterRejoin = getRoomState(resumeSocket);
  assert.equal(afterRejoin.players.length, 2);
  assert.equal(afterRejoin.spectators.length, 1);
  assert.equal(afterRejoin.players.filter((player) => player.id === createAck.playerId).length, 1);
  assert.equal(afterRejoin.players.find((player) => player.id === createAck.playerId).onlineStatus, "online");
});
