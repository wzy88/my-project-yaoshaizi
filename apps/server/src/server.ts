import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { WebSocketServer } from "ws";

import { PORT_RETRY_LIMIT, SERVER_HOST, SERVER_PORT, WS_PATH } from "./config.js";
import { RoomService } from "./engine/room-service.js";

function normalizePath(input: string): string {
  const value = String(input || "/").trim();
  if (!value) {
    return "/";
  }

  const trimmed = value.replace(/\/+$/, "");
  return trimmed || "/";
}

export function createServer() {
  const roomService = new RoomService();
  const retryLimit = Number.isFinite(PORT_RETRY_LIMIT) && PORT_RETRY_LIMIT >= 0
    ? Math.floor(PORT_RETRY_LIMIT)
    : 0;

  const httpServer = createHttpServer((req, res) => {
    const { method } = req;
    const parsed = new URL(req.url || "/", "http://localhost");
    const pathname = normalizePath(parsed.pathname);

    if (method === "GET" && pathname === "/health") {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8"
      });
      res.end(JSON.stringify({ ok: true, service: "dice-server", ts: Date.now() }));
      return;
    }

    if (method === "GET" && pathname === "/") {
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8"
      });
      res.end(`dice-server is running\nhealth: /health\nws: ${WS_PATH}\n`);
      return;
    }

    res.writeHead(404, {
      "content-type": "application/json; charset=utf-8"
    });
    res.end(JSON.stringify({ ok: false, message: "not found" }));
  });

  const wss = new WebSocketServer({
    noServer: true
  });

  wss.on("connection", (socket) => {
    roomService.attachConnection(socket);
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const rawUrl = request.url || "/";
    const parsed = new URL(rawUrl, "http://localhost");
    const reqPath = normalizePath(parsed.pathname);
    const expectedPath = normalizePath(WS_PATH);
    const pathAllowed = reqPath === expectedPath || (expectedPath === "/ws" && reqPath === "/");

    if (!pathAllowed) {
      // eslint-disable-next-line no-console
      console.warn(`[dice-server] reject upgrade path=${reqPath}, expected=${expectedPath}`);
      socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  let activePort = SERVER_PORT;
  let attempts = 0;

  function printListeningAddress() {
    const address = httpServer.address() as AddressInfo | null;
    const port = address?.port ?? activePort;

    // eslint-disable-next-line no-console
    console.log(`[dice-server] http listening on http://${SERVER_HOST}:${port}`);
    // eslint-disable-next-line no-console
    console.log(`[dice-server] ws listening on ws://${SERVER_HOST}:${port}${WS_PATH}`);

    if (SERVER_HOST === "127.0.0.1" || SERVER_HOST === "localhost") {
      // eslint-disable-next-line no-console
      console.log("[dice-server] local-only mode enabled (use WeChat DevTools proxy for real-device debugging)");
    }
  }

  function listenOnPort(port: number) {
    activePort = port;
    httpServer.listen({
      host: SERVER_HOST,
      port
    });
  }

  httpServer.on("listening", () => {
    printListeningAddress();
  });

  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE" && attempts < retryLimit) {
      attempts += 1;
      const nextPort = activePort + 1;
      // eslint-disable-next-line no-console
      console.warn(`[dice-server] port ${activePort} in use, retrying on ${nextPort} (${attempts}/${retryLimit})`);
      setImmediate(() => listenOnPort(nextPort));
      return;
    }

    if (error.code === "EADDRINUSE") {
      // eslint-disable-next-line no-console
      console.error(`[dice-server] port ${activePort} is occupied. macOS check: lsof -nP -iTCP:${activePort} -sTCP:LISTEN`);
      // eslint-disable-next-line no-console
      console.error(`[dice-server] stop process: kill -15 <PID>`);
      return;
    }

    // eslint-disable-next-line no-console
    console.error("[dice-server] http server error:", error);
  });

  listenOnPort(SERVER_PORT);

  return { httpServer, wss };
}
