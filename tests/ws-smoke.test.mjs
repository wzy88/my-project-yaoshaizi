import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { once } from "node:events";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

import WebSocket from "ws";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function startServerProcess() {
  const host = String(process.env.DICE_WS_HOST || "127.0.0.1");
  const port = String(process.env.DICE_WS_PORT || "0");
  const proc = spawn(process.execPath, ["apps/server/dist/index.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      HOST: host,
      PORT: port,
      PORT_RETRY_LIMIT: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const rl = readline.createInterface({ input: proc.stdout });
  const rle = readline.createInterface({ input: proc.stderr });

  const lines = [];
  const onLine = (line) => lines.push(String(line || ""));
  rl.on("line", onLine);
  rle.on("line", onLine);

  const waitForWsUrl = (timeoutMs = 5000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting server listen log. lines=${lines.slice(-10).join(" | ")}`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      rl.off("line", handler);
      rle.off("line", handler);
    };

    const handler = (line) => {
      const text = String(line || "");
      const match = text.match(/ws listening on (ws:\/\/[^\s]+)/i);
      if (match && match[1]) {
        cleanup();
        resolve(match[1]);
      }
    };

    rl.on("line", handler);
    rle.on("line", handler);
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

  return { proc, waitForWsUrl, stop };
}

function connectWs(url) {
  const ws = new WebSocket(url);
  const open = once(ws, "open");
  return { ws, open };
}

function createMessageQueue(ws) {
  const emitter = new EventEmitter();
  /** @type {Array<{event:string, payload:any}>} */
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
        const msg = messages[cursor];
        cursor += 1;
        if (filterFn(msg)) {
          return msg;
        }
      }
      return null;
    };

    const found = tryDrain();
    if (found) {
      resolve(found);
      return;
    }

    const timer = setInterval(() => {
      const hit = tryDrain();
      if (hit) {
        clearInterval(timer);
        emitter.removeListener("msg", onMsg);
        resolve(hit);
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        emitter.removeListener("msg", onMsg);
        reject(new Error("timeout waiting message"));
      }
    }, 20);

    const onMsg = () => {
      const hit = tryDrain();
      if (hit) {
        clearInterval(timer);
        emitter.removeListener("msg", onMsg);
        resolve(hit);
      }
    };

    emitter.on("msg", onMsg);
  });

  return {
    waitForAck: (actionId, timeoutMs = 3000) => waitFor(
      (m) => m.event === "action:ack" && m.payload && m.payload.actionId === actionId,
      timeoutMs
    ).then((m) => m.payload),
    waitForEvent: (eventName, predicate = null, timeoutMs = 3000) => waitFor(
      (m) => m.event === eventName && (!predicate || predicate(m.payload)),
      timeoutMs
    ).then((m) => m.payload)
  };
}

function sendAction(ws, event, payload) {
  const actionId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  ws.send(JSON.stringify({ event, payload, actionId }));
  return actionId;
}

const RUN_WS_SMOKE = process.env.DICE_WS_SMOKE === "1";
const wsTest = RUN_WS_SMOKE ? test : test.skip;

wsTest("ws smoke: create -> join -> start -> finishRolling -> call -> open", { timeout: 15000 }, async () => {
  const externalWsUrlRaw = String(process.env.DICE_WS_URL || "").trim();
  const useExternal = Boolean(externalWsUrlRaw);

  const server = useExternal ? null : startServerProcess();
  const wsUrl = useExternal ? externalWsUrlRaw : await server.waitForWsUrl();

  const { ws: wsA, open: openA } = connectWs(wsUrl);
  await openA;
  const qA = createMessageQueue(wsA);

  const actionCreate = sendAction(wsA, "room:create", {
    nickname: "A",
    avatar: "",
    config: {
      direction: "cw",
      wildcardOneEnabled: true,
      openMode: "single",
      dicePerPlayer: 5,
      minOpeningCount: 2,
      testMode: true
    }
  });
  const ackCreate = await qA.waitForAck(actionCreate);
  assert.equal(ackCreate.ok, true);
  assert.ok(ackCreate.roomId);
  assert.ok(ackCreate.playerId);
  const roomId = ackCreate.roomId;
  const playerA = ackCreate.playerId;

  const { ws: wsB, open: openB } = connectWs(wsUrl);
  await openB;
  const qB = createMessageQueue(wsB);
  const actionJoin = sendAction(wsB, "room:join", { roomId, nickname: "B", avatar: "" });
  const ackJoin = await qB.waitForAck(actionJoin);
  assert.equal(ackJoin.ok, true);
  const playerB = ackJoin.playerId;
  assert.ok(playerB && playerB !== playerA);

  // Inject deterministic dice (owner can set for any player in testMode).
  let action = sendAction(wsA, "test:setNextDice", { playerId: playerA, dice: [2, 2, 3, 3, 3] });
  let ack = await qA.waitForAck(action);
  assert.equal(ack.ok, true);

  action = sendAction(wsA, "test:setNextDice", { playerId: playerB, dice: [1, 4, 5, 6, 6] });
  ack = await qA.waitForAck(action);
  assert.equal(ack.ok, true);

  action = sendAction(wsA, "game:start", {});
  ack = await qA.waitForAck(action);
  assert.equal(ack.ok, true);

  action = sendAction(wsA, "rolling:finish", {});
  ack = await qA.waitForAck(action);
  assert.equal(ack.ok, true);

  // Wait for calling.
  const stateCalling = await qA.waitForEvent("room:state", (s) => s && s.phase === "calling", 4000);
  const currentId = stateCalling.currentPlayerId;
  assert.ok(currentId === playerA || currentId === playerB);

  // First player makes a call.
  const wsCaller = currentId === playerA ? wsA : wsB;
  const qCaller = currentId === playerA ? qA : qB;
  action = sendAction(wsCaller, "call:make", { count: 2, point: 2 });
  ack = await qCaller.waitForAck(action);
  assert.equal(ack.ok, true);

  // Next player opens.
  const stateAfterCall = await qA.waitForEvent("room:state", (s) => s && s.phase === "calling" && s.lastCall, 4000);
  const openerId = stateAfterCall.currentPlayerId;
  assert.ok(openerId && openerId !== stateAfterCall.lastCall.by);
  const wsOpener = openerId === playerA ? wsA : wsB;
  const qOpener = openerId === playerA ? qA : qB;
  action = sendAction(wsOpener, "open:request", {});
  ack = await qOpener.waitForAck(action, 5000);
  assert.equal(ack.ok, true);

  const openResult = await qA.waitForEvent("open:result", (p) => p && p.targets && p.targets.length === 1, 5000);
  assert.equal(openResult.targets.length, 1);

  const stateEnded = await qA.waitForEvent("room:state", (s) => s && s.phase === "ended", 5000);
  assert.equal(stateEnded.phase, "ended");

  try { wsA.close(); } catch {}
  try { wsB.close(); } catch {}
  if (server) {
    await server.stop();
  }
});

wsTest("ws smoke: themed room create broadcasts the selected theme and can start with two players", { timeout: 15000 }, async () => {
  const externalWsUrlRaw = String(process.env.DICE_WS_URL || "").trim();
  const useExternal = Boolean(externalWsUrlRaw);

  const server = useExternal ? null : startServerProcess();
  const wsUrl = useExternal ? externalWsUrlRaw : await server.waitForWsUrl();

  const { ws: wsA, open: openA } = connectWs(wsUrl);
  await openA;
  const qA = createMessageQueue(wsA);

  const actionCreate = sendAction(wsA, "room:create", {
    nickname: "A",
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
  });
  const ackCreate = await qA.waitForAck(actionCreate);
  assert.equal(ackCreate.ok, true);
  const roomId = ackCreate.roomId;
  const playerA = ackCreate.playerId;

  const firstState = await qA.waitForEvent("room:state", (state) => state && state.roomId === roomId, 4000);
  assert.equal(firstState.config.themeId, "ruby-red");

  const { ws: wsB, open: openB } = connectWs(wsUrl);
  await openB;
  const qB = createMessageQueue(wsB);
  const actionJoin = sendAction(wsB, "room:join", { roomId, nickname: "B", avatar: "" });
  const ackJoin = await qB.waitForAck(actionJoin);
  assert.equal(ackJoin.ok, true);
  assert.ok(ackJoin.playerId && ackJoin.playerId !== playerA);

  const readyState = await qA.waitForEvent(
    "room:state",
    (state) => state && state.roomId === roomId && state.phase === "ready" && state.players && state.players.length === 2,
    4000
  );
  assert.equal(readyState.config.themeId, "ruby-red");

  const startAction = sendAction(wsA, "game:start", {});
  const startAck = await qA.waitForAck(startAction);
  assert.equal(startAck.ok, true);

  const rollingState = await qA.waitForEvent(
    "room:state",
    (state) => state && state.roomId === roomId && state.phase === "rolling",
    4000
  );
  assert.equal(rollingState.phase, "rolling");
  assert.equal(rollingState.config.themeId, "ruby-red");

  try {
    wsB.close();
  } catch {}
  try {
    wsA.close();
  } catch {}
  if (server) {
    await server.stop();
  }
});
