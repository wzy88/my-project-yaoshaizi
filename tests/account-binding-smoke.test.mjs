import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { once } from "node:events";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import WebSocket from "ws";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function startServerProcess(dataDir) {
  const proc = spawn(process.execPath, ["apps/server/dist/index.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      PORT_RETRY_LIMIT: "0",
      WECHAT_AUTH_MOCK: "1",
      DICE_DATA_DIR: dataDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const rl = readline.createInterface({ input: proc.stdout });
  const rle = readline.createInterface({ input: proc.stderr });
  const lines = [];
  const onLine = (line) => lines.push(String(line || ""));
  rl.on("line", onLine);
  rle.on("line", onLine);

  const waitForUrls = (timeoutMs = 5000) => new Promise((resolve, reject) => {
    const urls = { httpUrl: "", wsUrl: "" };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting server listen log. lines=${lines.slice(-10).join(" | ")}`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      rl.off("line", handler);
      rle.off("line", handler);
    };

    const tryResolve = () => {
      if (urls.httpUrl && urls.wsUrl) {
        cleanup();
        resolve(urls);
      }
    };

    const handler = (line) => {
      const text = String(line || "");
      const httpMatch = text.match(/http listening on (http:\/\/[^\s]+)/i);
      const wsMatch = text.match(/ws listening on (ws:\/\/[^\s]+)/i);
      if (httpMatch && httpMatch[1]) {
        urls.httpUrl = httpMatch[1];
      }
      if (wsMatch && wsMatch[1]) {
        urls.wsUrl = wsMatch[1];
      }
      tryResolve();
    };

    rl.on("line", handler);
    rle.on("line", handler);
    lines.forEach(handler);
  });

  const stop = async () => {
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
    try {
      rl.close();
      rle.close();
    } catch {
      // ignore
    }
    try {
      await once(proc, "exit");
    } catch {
      // ignore
    }
  };

  return { waitForUrls, stop };
}

function connectWs(url) {
  const ws = new WebSocket(url);
  const open = once(ws, "open");
  return { ws, open };
}

function createMessageQueue(ws) {
  const emitter = new EventEmitter();
  const messages = [];

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.event !== "string") {
      return;
    }
    messages.push({ event: msg.event, payload: msg.payload });
    emitter.emit("msg");
  });

  let cursor = 0;

  const waitFor = (filterFn, timeoutMs = 3000) => new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const tryDrain = () => {
      while (cursor < messages.length) {
        const message = messages[cursor];
        cursor += 1;
        if (filterFn(message)) {
          return message;
        }
      }
      return null;
    };

    const hit = tryDrain();
    if (hit) {
      resolve(hit);
      return;
    }

    const timer = setInterval(() => {
      const next = tryDrain();
      if (next) {
        clearInterval(timer);
        emitter.removeListener("msg", onMsg);
        resolve(next);
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        emitter.removeListener("msg", onMsg);
        reject(new Error("timeout waiting message"));
      }
    }, 20);

    const onMsg = () => {
      const next = tryDrain();
      if (next) {
        clearInterval(timer);
        emitter.removeListener("msg", onMsg);
        resolve(next);
      }
    };

    emitter.on("msg", onMsg);
  });

  return {
    waitForAck(actionId, timeoutMs = 3000) {
      return waitFor(
        (message) => message.event === "action:ack" && message.payload && message.payload.actionId === actionId,
        timeoutMs
      ).then((message) => message.payload);
    },
    waitForEvent(eventName, predicate = null, timeoutMs = 3000) {
      return waitFor(
        (message) => message.event === eventName && (!predicate || predicate(message.payload)),
        timeoutMs
      ).then((message) => message.payload);
    }
  };
}

function sendAction(ws, event, payload) {
  const actionId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  ws.send(JSON.stringify({ event, payload, actionId }));
  return actionId;
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function patchJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers
  });
  const json = await response.json();
  return { status: response.status, json };
}

test("account binding smoke: wechat login keeps a stable account and round stats", { timeout: 20000 }, async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "dice-account-stats-"));
  const server = startServerProcess(dataDir);
  let wsA;
  let wsB;

  try {
    const { httpUrl, wsUrl } = await server.waitForUrls();

    const loginA = await postJson(`${httpUrl}/api/auth/wechat-login`, {
      code: "user-a",
      nickname: "阿伟A",
      avatarUrl: "https://example.com/a.png"
    });
    assert.equal(loginA.status, 200);
    const sessionA = loginA.json.data;

    const loginB = await postJson(`${httpUrl}/api/auth/wechat-login`, {
      code: "user-b",
      nickname: "阿伟B",
      avatarUrl: "https://example.com/b.png"
    });
    assert.equal(loginB.status, 200);
    const sessionB = loginB.json.data;

    ({ ws: wsA } = connectWs(wsUrl));
    await once(wsA, "open");
    const qA = createMessageQueue(wsA);

    let actionId = sendAction(wsA, "room:create", {
      nickname: "阿伟A",
      avatar: "https://example.com/a.png",
      accountId: sessionA.profile.accountId,
      accountSessionToken: sessionA.sessionToken,
      config: {
        direction: "cw",
        wildcardOneEnabled: true,
        openMode: "single",
        dicePerPlayer: 5,
        minOpeningCount: 2,
        testMode: true
      }
    });
    const createAck = await qA.waitForAck(actionId);
    assert.equal(createAck.ok, true);
    const roomId = createAck.roomId;
    const playerA = createAck.playerId;

    ({ ws: wsB } = connectWs(wsUrl));
    await once(wsB, "open");
    const qB = createMessageQueue(wsB);

    actionId = sendAction(wsB, "room:join", {
      roomId,
      nickname: "阿伟B",
      avatar: "https://example.com/b.png",
      accountId: sessionB.profile.accountId,
      accountSessionToken: sessionB.sessionToken
    });
    const joinAck = await qB.waitForAck(actionId);
    assert.equal(joinAck.ok, true);
    const playerB = joinAck.playerId;

    actionId = sendAction(wsA, "test:setNextDice", { playerId: playerA, dice: [2, 2, 3, 3, 3] });
    assert.equal((await qA.waitForAck(actionId)).ok, true);

    actionId = sendAction(wsA, "test:setNextDice", { playerId: playerB, dice: [1, 4, 5, 6, 6] });
    assert.equal((await qA.waitForAck(actionId)).ok, true);

    actionId = sendAction(wsA, "game:start", {});
    assert.equal((await qA.waitForAck(actionId)).ok, true);

    actionId = sendAction(wsA, "rolling:finish", {});
    assert.equal((await qA.waitForAck(actionId)).ok, true);

    const stateCalling = await qA.waitForEvent("room:state", (payload) => payload && payload.phase === "calling", 4000);
    const callerId = stateCalling.currentPlayerId;
    const wsCaller = callerId === playerA ? wsA : wsB;
    const qCaller = callerId === playerA ? qA : qB;
    actionId = sendAction(wsCaller, "call:make", { count: 2, point: 2 });
    assert.equal((await qCaller.waitForAck(actionId)).ok, true);

    const stateAfterCall = await qA.waitForEvent("room:state", (payload) => payload && payload.phase === "calling" && payload.lastCall, 4000);
    const openerId = stateAfterCall.currentPlayerId;
    const wsOpener = openerId === playerA ? wsA : wsB;
    const qOpener = openerId === playerA ? qA : qB;
    actionId = sendAction(wsOpener, "open:request", {});
    assert.equal((await qOpener.waitForAck(actionId, 5000)).ok, true);

    const openResult = await qA.waitForEvent("open:result", (payload) => payload && payload.targets && payload.targets.length === 1, 5000);
    const winnerId = openResult.targets[0].winnerId;
    const winnerIsA = winnerId === playerA;

    const profileAResponse = await getJson(`${httpUrl}/api/account/me`, {
      "x-dice-account-id": sessionA.profile.accountId,
      "x-dice-session-token": sessionA.sessionToken
    });
    const profileBResponse = await getJson(`${httpUrl}/api/account/me`, {
      "x-dice-account-id": sessionB.profile.accountId,
      "x-dice-session-token": sessionB.sessionToken
    });

    assert.equal(profileAResponse.status, 200);
    assert.equal(profileBResponse.status, 200);

    const profileA = profileAResponse.json.data;
    const profileB = profileBResponse.json.data;

    assert.equal(profileA.stats.totalRounds, 1);
    assert.equal(profileB.stats.totalRounds, 1);
    assert.equal(profileA.stats.roomsCreated, 1);
    assert.equal(profileB.stats.roomsJoined, 1);
    assert.equal(profileA.stats.roundsWon, winnerIsA ? 1 : 0);
    assert.equal(profileA.stats.roundsLost, winnerIsA ? 0 : 1);
    assert.equal(profileB.stats.roundsWon, winnerIsA ? 0 : 1);
    assert.equal(profileB.stats.roundsLost, winnerIsA ? 1 : 0);
    assert.equal(profileA.recentRooms[0].roomId, roomId);
    assert.equal(profileB.recentRooms[0].roomId, roomId);

    const loginAAgain = await postJson(`${httpUrl}/api/auth/wechat-login`, {
      code: "user-a",
      nickname: "阿伟A2",
      avatarUrl: "https://example.com/a-2.png"
    });
    assert.equal(loginAAgain.status, 200);
    assert.equal(loginAAgain.json.data.profile.accountId, sessionA.profile.accountId);
    assert.equal(loginAAgain.json.data.profile.stats.totalRounds, 1);
    assert.equal(loginAAgain.json.data.profile.nickname, "阿伟A2");

    const patchProfile = await patchJson(`${httpUrl}/api/account/profile`, {
      nickname: "阿伟A3"
    }, {
      "x-dice-account-id": sessionA.profile.accountId,
      "x-dice-session-token": loginAAgain.json.data.sessionToken
    });
    assert.equal(patchProfile.status, 200);
    assert.equal(patchProfile.json.data.nickname, "阿伟A3");
  } finally {
    try { wsA?.close(); } catch {}
    try { wsB?.close(); } catch {}
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("account binding smoke: a customized nickname survives later default-profile logins for the same wechat identity", { timeout: 20000 }, async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "dice-account-custom-nickname-"));
  const server = startServerProcess(dataDir);

  try {
    const { httpUrl } = await server.waitForUrls();

    const firstLogin = await postJson(`${httpUrl}/api/auth/wechat-login`, {
      code: "same-user",
      nickname: "玩家318",
      nicknameCustomized: false,
      avatarUrl: "/assets/figma-room-v2/avatar-blossom.svg"
    });
    assert.equal(firstLogin.status, 200);
    assert.equal(String(firstLogin.json.data.profile.avatarUrl || "").endsWith(".png"), true);

    const patched = await patchJson(`${httpUrl}/api/account/profile`, {
      nickname: "春树",
      nicknameCustomized: true
    }, {
      "x-dice-account-id": firstLogin.json.data.profile.accountId,
      "x-dice-session-token": firstLogin.json.data.sessionToken
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.data.nickname, "春树");
    assert.equal(patched.json.data.nicknameCustomized, true);

    const laterDefaultLogin = await postJson(`${httpUrl}/api/auth/wechat-login`, {
      code: "same-user",
      nickname: "玩家402",
      nicknameCustomized: false,
      avatarUrl: "/assets/figma-room-v2/avatar-butterfly.svg"
    });
    assert.equal(laterDefaultLogin.status, 200);
    assert.equal(laterDefaultLogin.json.data.profile.accountId, firstLogin.json.data.profile.accountId);
    assert.equal(laterDefaultLogin.json.data.profile.nickname, "春树");
    assert.equal(laterDefaultLogin.json.data.profile.nicknameCustomized, true);
    assert.equal(String(laterDefaultLogin.json.data.profile.avatarUrl || "").endsWith(".png"), true);
  } finally {
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("account binding smoke: removed bundled woman avatar is reassigned during login", { timeout: 20000 }, async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "dice-account-removed-avatar-"));
  const server = startServerProcess(dataDir);

  try {
    const { httpUrl } = await server.waitForUrls();

    const login = await postJson(`${httpUrl}/api/auth/wechat-login`, {
      code: "removed-default-avatar",
      nickname: "玩家518",
      nicknameCustomized: false,
      avatarUrl: "/assets/figma-room-v2/avatar-woman.svg"
    });

    assert.equal(login.status, 200);
    assert.equal(String(login.json.data.profile.avatarUrl || "").endsWith(".png"), true);
    assert.notEqual(String(login.json.data.profile.avatarUrl || ""), "/assets/figma-room-v2/avatar-woman.png");
  } finally {
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
});
