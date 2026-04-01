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
  const proc = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      PORT_RETRY_LIMIT: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const rl = readline.createInterface({ input: proc.stdout });
  const rle = readline.createInterface({ input: proc.stderr });
  const lines = [];

  const onLine = (line) => {
    lines.push(String(line || ""));
  };
  rl.on("line", onLine);
  rle.on("line", onLine);

  const waitForWsUrl = (timeoutMs = 5000) => new Promise((resolve, reject) => {
    const handler = (line) => {
      const text = String(line || "");
      const match = text.match(/ws listening on (ws:\/\/[^\s]+)/i);
      if (!match || !match[1]) {
        return;
      }
      cleanup();
      resolve(match[1]);
    };

    const cleanup = () => {
      clearTimeout(timer);
      rl.off("line", handler);
      rle.off("line", handler);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting server. lines=${lines.slice(-10).join(" | ")}`));
    }, timeoutMs);

    rl.on("line", handler);
    rle.on("line", handler);
  });

  const stop = async () => {
    try {
      proc.kill("SIGTERM");
    } catch (error) {
      // ignore
    }
    try {
      rl.close();
      rle.close();
    } catch (error) {
      // ignore
    }
    try {
      await once(proc, "exit");
    } catch (error) {
      // ignore
    }
  };

  return { waitForWsUrl, stop };
}

function createMessageQueue(ws) {
  const emitter = new EventEmitter();
  const messages = [];

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (error) {
      return;
    }
    if (!msg || typeof msg.event !== "string") {
      return;
    }
    messages.push(msg);
    emitter.emit("message");
  });

  let cursor = 0;

  return {
    waitForAck(actionId, timeoutMs = 3000) {
      return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;

        const tryRead = () => {
          while (cursor < messages.length) {
            const next = messages[cursor];
            cursor += 1;
            if (
              next.event === "action:ack" &&
              next.payload &&
              next.payload.actionId === actionId
            ) {
              return next.payload;
            }
          }
          return null;
        };

        const immediate = tryRead();
        if (immediate) {
          resolve(immediate);
          return;
        }

        const timer = setInterval(() => {
          const found = tryRead();
          if (found) {
            clearInterval(timer);
            emitter.removeListener("message", onMessage);
            resolve(found);
            return;
          }
          if (Date.now() > deadline) {
            clearInterval(timer);
            emitter.removeListener("message", onMessage);
            reject(new Error("timeout waiting ack"));
          }
        }, 20);

        const onMessage = () => {
          const found = tryRead();
          if (!found) {
            return;
          }
          clearInterval(timer);
          emitter.removeListener("message", onMessage);
          resolve(found);
        };

        emitter.on("message", onMessage);
      });
    }
  };
}

function sendAction(ws, event, payload) {
  const actionId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  ws.send(JSON.stringify({ event, payload, actionId }));
  return actionId;
}

test("ws heartbeat: server accepts heartbeat packets after room create", { timeout: 12000 }, async () => {
  const server = startServerProcess();
  let ws = null;

  try {
    const wsUrl = await server.waitForWsUrl();
    ws = new WebSocket(wsUrl);
    await once(ws, "open");

    const queue = createMessageQueue(ws);

    const createActionId = sendAction(ws, "room:create", {
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
    const createAck = await queue.waitForAck(createActionId);
    assert.equal(createAck.ok, true);
    assert.ok(createAck.roomId);

    const heartbeatActionId = sendAction(ws, "system:heartbeat", {
      ts: Date.now()
    });
    const heartbeatAck = await queue.waitForAck(heartbeatActionId);
    assert.equal(heartbeatAck.ok, true);
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch (error) {
        // ignore
      }
    }
    await server.stop();
  }
});
