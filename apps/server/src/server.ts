import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { WebSocketServer } from "ws";

import { PORT_RETRY_LIMIT, SERVER_HOST, SERVER_PORT, WS_PATH } from "./config.js";
import { AccountStore } from "./engine/account-store.js";
import { RoomService } from "./engine/room-service.js";
import { resolveWechatIdentity } from "./services/wechat-session-resolver.js";
import { validateNicknameInput } from "./utils/nickname-validator.js";

function normalizePath(input: string): string {
  const value = String(input || "/").trim();
  if (!value) {
    return "/";
  }

  const trimmed = value.replace(/\/+$/, "");
  return trimmed || "/";
}

export function createServer() {
  const accountStore = new AccountStore();
  const roomService = new RoomService(accountStore);
  const retryLimit = Number.isFinite(PORT_RETRY_LIMIT) && PORT_RETRY_LIMIT >= 0
    ? Math.floor(PORT_RETRY_LIMIT)
    : 0;

  const httpServer = createHttpServer((req, res) => {
    void handleHttpRequest(req, res, accountStore, roomService);
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

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  accountStore: AccountStore,
  roomService: RoomService
): Promise<void> {
  try {
    const { method = "GET" } = req;
    const parsed = new URL(req.url || "/", "http://localhost");
    const pathname = normalizePath(parsed.pathname);

    if (method === "OPTIONS") {
      sendEmpty(res, 204);
      return;
    }

    if (method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "dice-server",
        ts: Date.now()
      });
      return;
    }

    if (method === "POST" && pathname === "/api/room-exists") {
      const body = await readJsonBody(req);
      const roomId = String(body.roomId || "").trim();
      if (!/^\d{6}$/.test(roomId)) {
        sendJson(res, 200, {
          ok: true,
          data: {
            roomId,
            exists: false
          }
        });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        data: {
          roomId,
          exists: roomService.hasRoom(roomId)
        }
      });
      return;
    }

    if (method === "POST" && pathname === "/api/auth/wechat-login") {
      const body = await readJsonBody(req);
      const nicknameInput = String(body.nickname || "").trim();
      const nicknameCustomized = Boolean(body.nicknameCustomized);
      const avatarUrl = String(body.avatarUrl || "").trim();
      const code = String(body.code || "").trim();
      const nicknameResult = validateNicknameInput(nicknameInput);
      const nickname = nicknameResult.ok ? nicknameResult.value : "玩家";

      if (!avatarUrl) {
        sendJson(res, 400, { ok: false, message: "avatarUrl required" });
        return;
      }

      const identity = await resolveWechatIdentity({
        code,
        forwardedOpenId: getHeader(req, "x-wx-openid"),
        forwardedUnionId: getHeader(req, "x-wx-unionid")
      });

      const result = await accountStore.loginWithWechatIdentity({
        openId: identity.openId,
        unionId: identity.unionId,
        nickname,
        nicknameCustomized,
        avatarUrl,
        loginAt: Date.now(),
        authMode: identity.authMode
      });

      sendJson(res, 200, {
        ok: true,
        data: result
      });
      return;
    }

    if (method === "GET" && pathname === "/api/account/me") {
      const profile = await authenticateAccountRequest(req, accountStore);
      if (!profile) {
        sendJson(res, 401, { ok: false, message: "unauthorized" });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        data: profile
      });
      return;
    }

    if (method === "PATCH" && pathname === "/api/account/profile") {
      const profile = await authenticateAccountRequest(req, accountStore);
      if (!profile) {
        sendJson(res, 401, { ok: false, message: "unauthorized" });
        return;
      }

      const body = await readJsonBody(req);
      const nicknameInput = String(body.nickname || "").trim();
      const nicknameCustomized = typeof body.nicknameCustomized === "boolean"
        ? Boolean(body.nicknameCustomized)
        : undefined;
      const avatarUrl = String(body.avatarUrl || "").trim();
      if (!nicknameInput && !avatarUrl) {
        sendJson(res, 400, { ok: false, message: "profile patch required" });
        return;
      }

      let nickname = "";
      if (nicknameInput) {
        const nicknameResult = validateNicknameInput(nicknameInput);
        if (!nicknameResult.ok) {
          sendJson(res, 400, { ok: false, message: nicknameResult.message });
          return;
        }
        nickname = nicknameResult.value;
      }

      const nextProfile = await accountStore.syncProfile(profile.accountId, {
        nickname,
        nicknameCustomized,
        avatarUrl
      });
      if (!nextProfile) {
        sendJson(res, 404, { ok: false, message: "account not found" });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        data: nextProfile
      });
      return;
    }

    if (method === "GET" && pathname === "/") {
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8"
      });
      res.end(`dice-server is running\nhealth: /health\nws: ${WS_PATH}\nauth: /api/auth/wechat-login\n`);
      return;
    }

    sendJson(res, 404, {
      ok: false,
      message: "not found"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal error";
    sendJson(res, 500, {
      ok: false,
      message
    });
  }
}

async function authenticateAccountRequest(req: IncomingMessage, accountStore: AccountStore) {
  const accountId = getHeader(req, "x-dice-account-id");
  const sessionToken = getHeader(req, "x-dice-session-token");
  if (!accountId || !sessionToken) {
    return null;
  }

  return accountStore.verifySession(accountId, sessionToken);
}

function getHeader(req: IncomingMessage, key: string): string {
  const value = req.headers[String(key || "").toLowerCase()];
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }
  return String(value || "").trim();
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendEmpty(res: ServerResponse, statusCode: number): void {
  res.writeHead(statusCode);
  res.end();
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    const size = chunks.reduce((sum, item) => sum + item.length, 0);
    if (size > 512 * 1024) {
      throw new Error("request body too large");
    }
  }

  if (!chunks.length) {
    return {};
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }

  return JSON.parse(text) as Record<string, unknown>;
}
