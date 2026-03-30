import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import WebSocket from "ws";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function startServerProcess(envOverrides = {}) {
  const proc = spawn(process.execPath, ["apps/server/dist/index.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      PORT_RETRY_LIMIT: "0",
      ...envOverrides
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
      const match = String(line || "").match(/ws listening on (ws:\/\/[^\s]+)/i);
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

  return { stop, waitForWsUrl };
}

function connectWs(url) {
  const ws = new WebSocket(url);
  const open = once(ws, "open");
  return { ws, open };
}

function createMessageQueue(ws) {
  const messages = [];
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg && typeof msg.event === "string") {
        messages.push(msg);
      }
    } catch {
      // ignore malformed packets
    }
  });

  return {
    waitForAck(actionId, timeoutMs = 3000) {
      return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;

        const tryFind = () => {
          const index = messages.findIndex((msg) => (
            msg.event === "action:ack" &&
            msg.payload &&
            msg.payload.actionId === actionId
          ));

          if (index >= 0) {
            const [found] = messages.splice(index, 1);
            resolve(found.payload);
            return true;
          }

          return false;
        };

        if (tryFind()) {
          return;
        }

        const timer = setInterval(() => {
          if (tryFind()) {
            clearInterval(timer);
            return;
          }

          if (Date.now() > deadline) {
            clearInterval(timer);
            reject(new Error(`timeout waiting ack for ${actionId}`));
          }
        }, 20);
      });
    }
  };
}

function sendAction(ws, event, payload) {
  const actionId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  ws.send(JSON.stringify({ event, payload, actionId }));
  return actionId;
}

test("owner cannot create a second room while still in the first room", { timeout: 10000 }, async () => {
  const server = startServerProcess();
  /** @type {WebSocket | null} */
  let wsOwner = null;
  /** @type {WebSocket | null} */
  let wsGuest = null;

  try {
    const wsUrl = await server.waitForWsUrl();

    ({ ws: wsOwner } = connectWs(wsUrl));
    await once(wsOwner, "open");
    const qOwner = createMessageQueue(wsOwner);

    const createFirst = sendAction(wsOwner, "room:create", {
      nickname: "Owner",
      avatar: "",
      config: {
        direction: "cw",
        wildcardOneEnabled: true,
        openMode: "single",
        dicePerPlayer: 5,
        minOpeningCount: 2,
        testMode: false
      }
    });
    const ackFirst = await qOwner.waitForAck(createFirst);
    assert.equal(ackFirst.ok, true);
    assert.ok(ackFirst.roomId);

    const createSecond = sendAction(wsOwner, "room:create", {
      nickname: "Owner",
      avatar: "",
      config: {
        direction: "cw",
        wildcardOneEnabled: true,
        openMode: "single",
        dicePerPlayer: 5,
        minOpeningCount: 2,
        testMode: false
      }
    });
    const ackSecond = await qOwner.waitForAck(createSecond);
    assert.equal(ackSecond.ok, false);
    assert.equal(ackSecond.code, "BAD_REQUEST");

    ({ ws: wsGuest } = connectWs(wsUrl));
    await once(wsGuest, "open");
    const qGuest = createMessageQueue(wsGuest);

    const joinAction = sendAction(wsGuest, "room:join", {
      roomId: ackFirst.roomId,
      nickname: "Guest",
      avatar: ""
    });
    const joinAck = await qGuest.waitForAck(joinAction);
    assert.equal(joinAck.ok, true);
    assert.equal(joinAck.roomId, ackFirst.roomId);
  } finally {
    try {
      wsGuest?.close();
    } catch {
      // ignore
    }
    try {
      wsOwner?.close();
    } catch {
      // ignore
    }
    await server.stop();
  }
});

test("owner-only ready room is not auto-deleted after disconnect", { timeout: 10000 }, async () => {
  const server = startServerProcess({
    RECONNECT_GRACE_MS: "50"
  });
  /** @type {WebSocket | null} */
  let wsOwner = null;
  /** @type {WebSocket | null} */
  let wsGuest = null;

  try {
    const wsUrl = await server.waitForWsUrl();

    ({ ws: wsOwner } = connectWs(wsUrl));
    await once(wsOwner, "open");
    const qOwner = createMessageQueue(wsOwner);

    const createAction = sendAction(wsOwner, "room:create", {
      nickname: "Owner",
      avatar: "",
      config: {
        direction: "cw",
        wildcardOneEnabled: true,
        openMode: "single",
        dicePerPlayer: 5,
        minOpeningCount: 2,
        testMode: false
      }
    });
    const createAck = await qOwner.waitForAck(createAction);
    assert.equal(createAck.ok, true);
    assert.ok(createAck.roomId);

    wsOwner.close();
    await new Promise((resolve) => setTimeout(resolve, 120));

    ({ ws: wsGuest } = connectWs(wsUrl));
    await once(wsGuest, "open");
    const qGuest = createMessageQueue(wsGuest);

    const joinAction = sendAction(wsGuest, "room:join", {
      roomId: createAck.roomId,
      nickname: "Guest",
      avatar: ""
    });
    const joinAck = await qGuest.waitForAck(joinAction);
    assert.equal(joinAck.ok, true);
    assert.equal(joinAck.roomId, createAck.roomId);
  } finally {
    try {
      wsGuest?.close();
    } catch {
      // ignore
    }
    try {
      wsOwner?.close();
    } catch {
      // ignore
    }
    await server.stop();
  }
});

test("owner-only ready room is deleted on explicit leave", { timeout: 10000 }, async () => {
  const server = startServerProcess({
    RECONNECT_GRACE_MS: "50"
  });
  /** @type {WebSocket | null} */
  let wsOwner = null;
  /** @type {WebSocket | null} */
  let wsGuest = null;

  try {
    const wsUrl = await server.waitForWsUrl();

    ({ ws: wsOwner } = connectWs(wsUrl));
    await once(wsOwner, "open");
    const qOwner = createMessageQueue(wsOwner);

    const createAction = sendAction(wsOwner, "room:create", {
      nickname: "Owner",
      avatar: "",
      config: {
        direction: "cw",
        wildcardOneEnabled: true,
        openMode: "single",
        dicePerPlayer: 5,
        minOpeningCount: 2,
        testMode: false
      }
    });
    const createAck = await qOwner.waitForAck(createAction);
    assert.equal(createAck.ok, true);
    assert.ok(createAck.roomId);

    const leaveAction = sendAction(wsOwner, "room:leave", {});
    const leaveAck = await qOwner.waitForAck(leaveAction);
    assert.equal(leaveAck.ok, true);

    ({ ws: wsGuest } = connectWs(wsUrl));
    await once(wsGuest, "open");
    const qGuest = createMessageQueue(wsGuest);

    const joinAction = sendAction(wsGuest, "room:join", {
      roomId: createAck.roomId,
      nickname: "Guest",
      avatar: ""
    });
    const joinAck = await qGuest.waitForAck(joinAction);
    assert.equal(joinAck.ok, false);
    assert.equal(joinAck.code, "ROOM_NOT_FOUND");
  } finally {
    try {
      wsGuest?.close();
    } catch {
      // ignore
    }
    try {
      wsOwner?.close();
    } catch {
      // ignore
    }
    await server.stop();
  }
});
