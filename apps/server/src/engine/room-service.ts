import {
  CLIENT_EVENTS,
  ErrorCode,
  GameError,
  isCallHigher,
  type ClientEventName,
  type ClientEventMap,
  type ClientMessage,
  type RoomStateDTO,
  type ServerEventMap,
  type ServerMessage
} from "@dice/shared";
import WebSocket from "ws";

import {
  ALLOW_SAME_ACCOUNT_MULTI_JOIN,
  CALL_TIMEOUT_MS,
  MAX_PLAYERS,
  MAX_VOICE_BASE64_SIZE,
  RECONNECT_GRACE_MS
} from "../config.js";
import { assertValidNickname, validateNicknameInput } from "../utils/nickname-validator.js";
import { createPlayerId, createResumeToken, createRoomId } from "../utils/random.js";
import { AccountStore } from "./account-store.js";
import { HistoryStore } from "./history-store.js";
import { RoomEngine } from "./room-engine.js";
import { getRoomThemeManifest } from "./room-theme-catalog.js";
import { VoiceStore } from "./voice-store.js";
import { ChatStore } from "./chat-store.js";
import { TencentAsrService, type VoiceTranscriber } from "../services/tencent-asr-service.js";

function safeDecodeURIComponent(raw: unknown): string {
  const value = String(raw ?? "");
  if (!value) return "";
  if (!/%[0-9a-fA-F]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface Session {
  roomId: string;
  playerId: string;
}

type PlayerRemovalReason = "explicit_leave" | "switch_room" | "grace_timeout";

type AnyClientMessage = { [E in ClientEventName]: ClientMessage<E> }[ClientEventName];

function buildCallTurnKey(state: ReturnType<RoomEngine["getState"]>): string {
  return `${state.round}:${state.phase}:${state.currentPlayerId || "-"}:${state.lastCall ? state.lastCall.ts : 0}`;
}

const MIN_VOICE_DURATION_MS = 300;
const MAX_CALL_VOICE_DURATION_MS = 5000;
const VOICE_MIN_INTERVAL_MS = 3000;
const VOICE_MAX_ATTEMPTS_PER_TURN = 3;
const VOICE_MAX_INVALID_ATTEMPTS_PER_TURN = 3;
const VOICE_MAX_ATTEMPTS_PER_MINUTE = 8;
const VOICE_WINDOW_MS = 60000;

interface VoiceTurnGuard {
  turnKey: string;
  attemptsUsed: number;
  invalidStreak: number;
  locked: boolean;
  lastAttemptAt: number;
  recentAttemptTimestamps: number[];
}

function parseVoiceCallInput(input: unknown): { count: number; point: number } | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/[，,。.!！?？、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const compact = normalized
    .replace(/\s/g, "")
    .replace(/第/g, "")
    .replace(/局/g, "")
    .replace(/点数/g, "点")
    .replace(/颗/g, "个")
    .replace(/枚/g, "个")
    .replace(/只/g, "个");

  const parseChineseNumber = (token: unknown): number => {
    const t = String(token || "").trim();
    if (!t) return Number.NaN;
    if (/^\d+$/.test(t)) return Number(t);

    const map: Record<string, number> = {
      零: 0,
      〇: 0,
      一: 1,
      壹: 1,
      幺: 1,
      二: 2,
      贰: 2,
      两: 2,
      三: 3,
      叁: 3,
      四: 4,
      肆: 4,
      五: 5,
      伍: 5,
      六: 6,
      陆: 6,
      溜: 6,
      七: 7,
      柒: 7,
      八: 8,
      捌: 8,
      九: 9,
      玖: 9
    };

    let str = t.replace(/点/g, "").replace(/个/g, "");
    if (!str) return Number.NaN;

    str = str.replace(/拾/g, "十");

    if (str === "十") return 10;
    if (str.length === 1 && map[str] != null) return map[str];

    const tenIndex = str.indexOf("十");
    if (tenIndex >= 0) {
      const left = str.slice(0, tenIndex);
      const right = str.slice(tenIndex + 1);
      const tens = left ? (Object.prototype.hasOwnProperty.call(map, left) ? map[left] : Number.NaN) : 1;
      const ones = right ? (Object.prototype.hasOwnProperty.call(map, right) ? map[right] : Number.NaN) : 0;
      if (!Number.isFinite(tens) || !Number.isFinite(ones)) return Number.NaN;
      return tens * 10 + ones;
    }

    if ([...str].every((ch) => map[ch] != null)) {
      const digits = [...str].map((ch) => map[ch]);
      return Number(digits.map(String).join(""));
    }

    return Number.NaN;
  };

  const parsePoint = (token: unknown): number => {
    const t = String(token || "").trim();
    if (!t) return Number.NaN;
    if (/^[1-6]$/.test(t)) return Number(t);

    const map: Record<string, number> = {
      一: 1,
      壹: 1,
      幺: 1,
      二: 2,
      贰: 2,
      两: 2,
      三: 3,
      叁: 3,
      四: 4,
      肆: 4,
      五: 5,
      伍: 5,
      六: 6,
      陆: 6,
      溜: 6
    };

    return map[t] ?? Number.NaN;
  };

  const tryBuild = (countToken: unknown, pointToken: unknown): { count: number; point: number } | null => {
    const count = parseChineseNumber(countToken);
    const point = parsePoint(pointToken);
    if (!Number.isInteger(count) || count <= 0) return null;
    if (!Number.isInteger(point) || point < 1 || point > 6) return null;
    return { count, point };
  };

  const m1 = compact.match(/^([0-9一二三四五六七八九十两幺零〇壹贰叁肆伍陆柒捌玖拾溜]+)个([0-9一二三四五六两幺壹贰叁肆伍陆溜])点?$/);
  if (m1) return tryBuild(m1[1], m1[2]);

  const m2 = normalized.match(/^([0-9]+|[一二三四五六七八九十两幺零〇壹贰叁肆伍陆柒捌玖拾溜]+)\s+([1-6]|[一二三四五六两幺壹贰叁肆伍陆溜])$/);
  if (m2) return tryBuild(m2[1], m2[2]);

  const m3 = compact.match(/([0-9一二三四五六七八九十两幺零〇壹贰叁肆伍陆柒捌玖拾溜]+)个?([0-9一二三四五六两幺壹贰叁肆伍陆溜])点?$/);
  if (m3) {
    const built = tryBuild(m3[1], m3[2]);
    if (built) return built;
  }

  if (/^[一二三四五六两幺壹贰叁肆伍陆溜][一二三四五六两幺壹贰叁肆伍陆溜]$/.test(compact)) {
    return tryBuild(compact[0], compact[1]);
  }

  return null;
}

function getVoiceMaxCallCount(state: RoomStateDTO): number {
  return Math.max(0, (Number(state.config?.dicePerPlayer) || 0) * (Array.isArray(state.players) ? state.players.length : 0));
}

function isVoiceCallLegalForState(state: RoomStateDTO, count: number, point: number): boolean {
  if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(point) || point < 1 || point > 6) {
    return false;
  }

  if (state.phase !== "calling" || !state.currentPlayerId) {
    return false;
  }

  const maxCount = getVoiceMaxCallCount(state);
  if (!maxCount || count > maxCount) {
    return false;
  }

  if (state.lastCall && state.lastCall.count > maxCount) {
    return false;
  }

  if (state.lastCall && state.lastCall.count === maxCount && state.lastCall.point === 6) {
    return false;
  }

  if (!state.lastCall && count < (Number(state.config?.minOpeningCount) || 0)) {
    return false;
  }

  return isCallHigher(state.lastCall, count, point);
}

interface BoundAccountIdentity {
  accountId: string;
  accountDisplayId: string;
  nickname: string;
  avatarUrl: string;
}

export class RoomService {
  private rooms = new Map<string, RoomEngine>();
  private sessions = new Map<WebSocket, Session>();
  private socketsByPlayerKey = new Map<string, WebSocket>();
  private playerResumeTokens = new Map<string, string>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private turnTimers = new Map<string, NodeJS.Timeout>();
  private turnTimerKeys = new Map<string, string>();
  private turnDeadlineTsByRoom = new Map<string, number>();
  private voiceTurnGuards = new Map<string, VoiceTurnGuard>();
  private readonly allowSameAccountMultiJoin: boolean;
  private readonly accountStore: AccountStore;
  private historyStore = new HistoryStore();
  private voiceStore = new VoiceStore();
  private chatStore = new ChatStore();
  private readonly voiceTranscriber: VoiceTranscriber;

  constructor(
    accountStore = new AccountStore(),
    voiceTranscriber: VoiceTranscriber = new TencentAsrService(),
    options: { allowSameAccountMultiJoin?: boolean } = {}
  ) {
    this.accountStore = accountStore;
    this.voiceTranscriber = voiceTranscriber;
    this.allowSameAccountMultiJoin = options.allowSameAccountMultiJoin ?? ALLOW_SAME_ACCOUNT_MULTI_JOIN;
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(String(roomId || "").trim());
  }

  getRoomEntrySnapshot(roomId: string): { exists: boolean; themeId: string; themeVersion: string } {
    const normalizedRoomId = String(roomId || "").trim();
    const room = this.rooms.get(normalizedRoomId);
    if (!room) {
      return {
        exists: false,
        themeId: "",
        themeVersion: ""
      };
    }

    const state = room.getState();
    return {
      exists: true,
      themeId: String(state.config?.themeId || ""),
      themeVersion: String(state.config?.themeVersion || "")
    };
  }

  private logDiagnostic(level: "log" | "warn", event: string, details: Record<string, unknown>): void {
    const logger = level === "warn" ? console.warn : console.log;
    logger(`[dice-server] ${event} ${JSON.stringify(details)}`);
  }

  private getSocketMeta(ws: WebSocket): Record<string, unknown> {
    const socketLike = ws as WebSocket & {
      _socket?: {
        remoteAddress?: string;
        remotePort?: number;
        localAddress?: string;
        localPort?: number;
      };
    };

    return {
      remoteAddress: socketLike._socket?.remoteAddress || "",
      remotePort: socketLike._socket?.remotePort ?? null,
      localAddress: socketLike._socket?.localAddress || "",
      localPort: socketLike._socket?.localPort ?? null
    };
  }

  private getRoomDiagnostics(roomId?: string): Record<string, unknown> {
    const activeRoomIds = Array.from(this.rooms.keys()).sort();
    const room = roomId ? this.rooms.get(roomId) : undefined;
    const state = room?.getState();

    return {
      roomId: roomId || "",
      roomExists: Boolean(room),
      activeRoomCount: activeRoomIds.length,
      activeRoomIds,
      phase: state?.phase || null,
      playerCount: state?.players.length ?? 0,
      spectatorCount: state?.spectators.length ?? 0
    };
  }

  attachConnection(ws: WebSocket): void {
    ws.on("message", (raw) => {
      this.onMessage(ws, raw.toString());
    });

    ws.on("close", () => {
      this.handleSocketDisconnected(ws);
    });

    ws.on("error", () => {
      this.handleSocketDisconnected(ws);
    });
  }

  private onMessage(ws: WebSocket, raw: string): void {
    let message: AnyClientMessage;

    try {
      message = JSON.parse(raw) as AnyClientMessage;
    } catch {
      this.sendSystemError(ws, ErrorCode.BAD_REQUEST, "消息格式错误");
      return;
    }

    if (!this.isValidClientEvent(message.event)) {
      this.sendSystemError(ws, ErrorCode.BAD_REQUEST, "未知事件");
      return;
    }

    this.handleEvent(ws, message).catch((error: unknown) => {
      this.handleError(ws, message.actionId, error);
    });
  }

  private async handleEvent(ws: WebSocket, message: AnyClientMessage): Promise<void> {
    switch (message.event) {
      case "room:create":
        await this.handleRoomCreate(ws, message.payload, message.actionId);
        break;
      case "room:join":
        await this.handleRoomJoin(ws, message.payload, message.actionId);
        break;
      case "room:rejoin":
        this.handleRoomRejoin(ws, message.payload, message.actionId);
        break;
      case "room:config:update":
        this.handleRoomConfigUpdate(ws, message.payload, message.actionId);
        break;
      case "room:participant:plan":
        this.handleRoomParticipantPlan(ws, message.payload, message.actionId);
        break;
      case "room:seating:commit":
        this.handleRoomSeatingCommit(ws, message.payload, message.actionId);
        break;
      case "history:list":
        await this.handleHistoryList(ws, message.payload, message.actionId);
        break;
      case "room:leave":
        this.handleRoomLeave(ws, message.actionId);
        break;
      case "player:update":
        await this.handlePlayerUpdate(ws, message.payload, message.actionId);
        break;
      case "game:start":
        this.handleGameStart(ws, message.actionId);
        break;
      case "dice:roll":
        this.handleDiceRoll(ws, message.actionId);
        break;
      case "dice:lock":
        this.handleDiceLock(ws, message.actionId);
        break;
      case "rolling:finish":
        this.handleRollingFinish(ws, message.actionId);
        break;
      case "call:make":
        this.handleCallMake(ws, message.payload, message.actionId);
        break;
      case "open:request":
        await this.handleOpenRequest(ws, message.payload, message.actionId);
        break;
      case "round:restart":
        this.handleRoundRestart(ws, message.actionId);
        break;
      case "chat:send":
        this.handleChatSend(ws, message.payload, message.actionId);
        break;
      case "chat:list":
        this.handleChatList(ws, message.payload, message.actionId);
        break;
      case "test:setSeed":
        this.handleTestSetSeed(ws, message.payload, message.actionId);
        break;
      case "test:setNextDice":
        this.handleTestSetNextDice(ws, message.payload, message.actionId);
        break;
      case "voice:upload":
        await this.handleVoiceUpload(ws, message.payload, message.actionId);
        break;
      case "voice:list":
        await this.handleVoiceList(ws, message.payload, message.actionId);
        break;
      case "voice:fetch":
        await this.handleVoiceFetch(ws, message.payload, message.actionId);
        break;
      case "system:heartbeat":
        this.handleHeartbeat(ws, message.payload, message.actionId);
        break;
      case "voice:transcript":
        {
          const { room, session } = this.getRoomAndSession(ws);
          this.ensureActivePlayer(room, session.playerId);
        }
        this.sendAck(ws, {
          actionId: message.actionId,
          ok: true
        });
        break;
      default:
        this.sendSystemError(ws, ErrorCode.BAD_REQUEST, "暂不支持的事件");
    }
  }

  private async handlePlayerUpdate(
    ws: WebSocket,
    payload: ClientEventMap["player:update"],
    actionId?: string
  ): Promise<void> {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    const nickname = payload.nickname == null
      ? undefined
      : assertValidNickname(safeDecodeURIComponent(payload.nickname));
    const avatar = payload.avatar == null ? undefined : String(payload.avatar || "").trim();

    room.updatePlayerProfile(session.playerId, {
      nickname: nickname || undefined,
      avatar
    });

    const accountId = this.getBoundAccountId(room, session.playerId);
    if (accountId) {
      await this.accountStore.syncProfile(accountId, {
        nickname: nickname || undefined,
        avatarUrl: avatar
      });
    }

    this.sendAck(ws, { actionId, ok: true });
    this.broadcastRoomState(session.roomId);
  }

  private handleChatSend(
    ws: WebSocket,
    payload: ClientEventMap["chat:send"],
    actionId?: string
  ): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    const text = String(payload.text || "").trim();
    if (!text) {
      throw new GameError(ErrorCode.BAD_REQUEST, "消息不能为空");
    }
    if (text.length > 140) {
      throw new GameError(ErrorCode.BAD_REQUEST, "消息过长（最多140字）");
    }

    const message = {
      id: `${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      playerId: session.playerId,
      text,
      createdAt: Date.now()
    };

    this.chatStore.push(session.roomId, message);
    this.sendAck(ws, { actionId, ok: true });
    this.broadcastRoom(session.roomId, "chat:new", {
      roomId: session.roomId,
      message,
      serverTs: Date.now()
    });
  }

  private handleChatList(
    ws: WebSocket,
    payload: ClientEventMap["chat:list"],
    actionId?: string
  ): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    const dto = this.chatStore.list(session.roomId, payload.limit);
    this.sendAck(ws, { actionId, ok: true });
    this.send(ws, "chat:list", dto);
  }

  private async handleRoomCreate(
    ws: WebSocket,
    payload: ClientEventMap["room:create"],
    actionId?: string
  ): Promise<void> {
    this.ensureOwnerCanCreateRoom(ws, actionId);
    this.prepareSocketForCreateOrJoin(ws);

    const nicknameInput = safeDecodeURIComponent(payload.nickname).trim() || "玩家";
    const nicknameResult = validateNicknameInput(nicknameInput);
    const nickname = nicknameResult.ok ? nicknameResult.value : "玩家";
    const avatar = String(payload.avatar || "");
    const boundAccount = await this.resolveBoundAccount(payload);

    const roomId = createRoomId(new Set(this.rooms.keys()));
    const playerId = createPlayerId();

    const themeManifest = getRoomThemeManifest(payload.config?.themeId);
    const roomConfig = {
      ...payload.config,
      themeId: themeManifest.id,
      themeVersion: themeManifest.version
    };

    const room = new RoomEngine(roomId, {
      id: playerId,
      accountId: boundAccount?.accountId,
      accountDisplayId: boundAccount?.accountDisplayId,
      nickname,
      avatar,
      isOwner: true
    }, roomConfig);

    this.rooms.set(roomId, room);
    this.bindSession(ws, roomId, playerId);

    const resumeToken = this.createOrRefreshResumeToken(roomId, playerId);
    if (boundAccount) {
      await this.accountStore.touchRoom(boundAccount.accountId, roomId, "owner");
    }

    this.logDiagnostic("log", "room:create", {
      actionId: actionId || "",
      ownerPlayerId: playerId,
      accountId: boundAccount?.accountId || "",
      nickname,
      requestedThemeId: String(payload.config?.themeId || ""),
      storedThemeId: String(room.getState().config.themeId || ""),
      ...this.getRoomDiagnostics(roomId),
      ...this.getSocketMeta(ws)
    });

    this.sendAck(ws, {
      actionId,
      ok: true,
      roomId,
      playerId,
      resumeToken,
      themeId: room.getState().config.themeId,
      themeVersion: room.getState().config.themeVersion,
      themeManifest: getRoomThemeManifest(room.getState().config.themeId, room.getState().config.themeVersion)
    });

    this.broadcastRoomState(roomId);
  }

  private async handleRoomJoin(
    ws: WebSocket,
    payload: ClientEventMap["room:join"],
    actionId?: string
  ): Promise<void> {
    this.prepareSocketForCreateOrJoin(ws);

    this.logDiagnostic("log", "room:join:attempt", {
      actionId: actionId || "",
      requestedRoomId: payload.roomId,
      nickname: safeDecodeURIComponent(payload.nickname).trim() || "玩家",
      ...this.getRoomDiagnostics(payload.roomId),
      ...this.getSocketMeta(ws)
    });

    const room = this.rooms.get(payload.roomId);
    if (!room) {
      this.logDiagnostic("warn", "room:join:not_found", {
        actionId: actionId || "",
        requestedRoomId: payload.roomId,
        ...this.getRoomDiagnostics(payload.roomId),
        ...this.getSocketMeta(ws)
      });
      throw new GameError(ErrorCode.ROOM_NOT_FOUND, "房间不存在");
    }

    const nicknameInput = safeDecodeURIComponent(payload.nickname).trim() || "玩家";
    const nicknameResult = validateNicknameInput(nicknameInput);
    const nickname = nicknameResult.ok ? nicknameResult.value : "玩家";
    const avatar = String(payload.avatar || "");
    const boundAccount = await this.resolveBoundAccount(payload);

    const restoredParticipant = boundAccount
      ? this.findRoomParticipantByAccountId(room, boundAccount.accountId, {
        includeOnline: !this.allowSameAccountMultiJoin
      })
      : null;
    if (restoredParticipant) {
      const restoredPlayerId = restoredParticipant.id;
      this.clearReconnectTimer(payload.roomId, restoredPlayerId);
      room.updatePlayerProfile(restoredPlayerId, {
        nickname,
        avatar
      });
      room.setPlayerOnlineStatus(restoredPlayerId, "online");
      this.bindSession(ws, payload.roomId, restoredPlayerId);

      const restoredResumeToken = this.createOrRefreshResumeToken(payload.roomId, restoredPlayerId);
      if (boundAccount) {
        await this.accountStore.touchRoom(boundAccount.accountId, payload.roomId, "guest");
      }

      this.logDiagnostic("log", "room:join:restored", {
        actionId: actionId || "",
        requestedRoomId: payload.roomId,
        restoredPlayerId,
        accountId: boundAccount?.accountId || "",
        nickname,
        ...this.getRoomDiagnostics(payload.roomId),
        ...this.getSocketMeta(ws)
      });

      this.sendAck(ws, {
        actionId,
        ok: true,
        roomId: payload.roomId,
        playerId: restoredPlayerId,
        resumeToken: restoredResumeToken,
        themeId: room.getState().config.themeId,
        themeVersion: room.getState().config.themeVersion,
        themeManifest: getRoomThemeManifest(room.getState().config.themeId, room.getState().config.themeVersion)
      });

      const roomState = room.getState();
      this.broadcastRoomState(payload.roomId);

      if (roomState.players.some((player) => player.id === restoredPlayerId)) {
        const dice = room.getPlayerPrivateDice(restoredPlayerId);
        if (dice.length > 0) {
          this.sendToPlayer(payload.roomId, restoredPlayerId, "dice:privateResult", {
            round: roomState.round,
            playerId: restoredPlayerId,
            dice,
            serverTs: Date.now()
          });
        }
      }

      void this.sendLatestSummaryIfEnded(payload.roomId, restoredPlayerId);
      return;
    }

    const playerId = createPlayerId();
    const roomState = room.getState();
    const phase = roomState.phase;
    const participantCount = roomState.players.length + roomState.spectators.length;

    if (participantCount >= MAX_PLAYERS) {
      throw new GameError(ErrorCode.ROOM_FULL, "房间已满，无法旁观");
    }

    const shouldBindJoinedAccount = Boolean(
      boundAccount && !this.hasOnlineRoomParticipantByAccountId(room, boundAccount.accountId)
    );

    if (phase === "ready") {
      room.addPlayer({
        id: playerId,
        accountId: shouldBindJoinedAccount ? boundAccount?.accountId : undefined,
        accountDisplayId: shouldBindJoinedAccount ? boundAccount?.accountDisplayId : undefined,
        nickname,
        avatar
      });
    } else {
      room.addSpectator({
        id: playerId,
        accountId: shouldBindJoinedAccount ? boundAccount?.accountId : undefined,
        accountDisplayId: shouldBindJoinedAccount ? boundAccount?.accountDisplayId : undefined,
        nickname,
        avatar
      });
    }

    this.bindSession(ws, payload.roomId, playerId);

    const resumeToken = this.createOrRefreshResumeToken(payload.roomId, playerId);
    if (boundAccount && shouldBindJoinedAccount) {
      await this.accountStore.touchRoom(boundAccount.accountId, payload.roomId, "guest");
    }

    this.logDiagnostic("log", "room:join:success", {
      actionId: actionId || "",
      requestedRoomId: payload.roomId,
      joinedPlayerId: playerId,
      accountId: boundAccount?.accountId || "",
      nickname,
      ...this.getRoomDiagnostics(payload.roomId),
      ...this.getSocketMeta(ws)
    });

    this.sendAck(ws, {
      actionId,
      ok: true,
      roomId: payload.roomId,
      playerId,
      resumeToken,
      themeId: room.getState().config.themeId,
      themeVersion: room.getState().config.themeVersion,
      themeManifest: getRoomThemeManifest(room.getState().config.themeId, room.getState().config.themeVersion)
    });

    this.broadcastRoomState(payload.roomId);
    void this.sendLatestSummaryIfEnded(payload.roomId, playerId);
  }

  private handleRoomRejoin(
    ws: WebSocket,
    payload: ClientEventMap["room:rejoin"],
    actionId?: string
  ): void {
    this.ensureSocketNotInRoom(ws);

    const room = this.rooms.get(payload.roomId);
    if (!room) {
      this.logDiagnostic("warn", "room:rejoin:not_found", {
        actionId: actionId || "",
        requestedRoomId: payload.roomId,
        playerId: payload.playerId,
        ...this.getRoomDiagnostics(payload.roomId),
        ...this.getSocketMeta(ws)
      });
      throw new GameError(ErrorCode.ROOM_NOT_FOUND, "房间不存在");
    }

    if (!room.hasParticipant(payload.playerId)) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "玩家不在房间中");
    }

    if (!this.verifyResumeToken(payload.roomId, payload.playerId, payload.resumeToken)) {
      throw new GameError(ErrorCode.FORBIDDEN, "重连凭证无效");
    }

    this.clearReconnectTimer(payload.roomId, payload.playerId);
    room.setPlayerOnlineStatus(payload.playerId, "online");
    this.bindSession(ws, payload.roomId, payload.playerId);

    this.sendAck(ws, {
      actionId,
      ok: true,
      roomId: payload.roomId,
      playerId: payload.playerId,
      resumeToken: payload.resumeToken,
      themeId: room.getState().config.themeId,
      themeVersion: room.getState().config.themeVersion,
      themeManifest: getRoomThemeManifest(room.getState().config.themeId, room.getState().config.themeVersion)
    });

    const roomState = room.getState();
    this.broadcastRoomState(payload.roomId);

    if (roomState.players.some((player) => player.id === payload.playerId)) {
      const dice = room.getPlayerPrivateDice(payload.playerId);
      if (dice.length > 0) {
        this.sendToPlayer(payload.roomId, payload.playerId, "dice:privateResult", {
          round: roomState.round,
          playerId: payload.playerId,
          dice,
          serverTs: Date.now()
        });
      }
    }

    void this.sendLatestSummaryIfEnded(payload.roomId, payload.playerId);
  }

  private handleRoomConfigUpdate(
    ws: WebSocket,
    payload: ClientEventMap["room:config:update"],
    actionId?: string
  ): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    room.updateConfig(session.playerId, payload);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private handleRoomParticipantPlan(
    ws: WebSocket,
    payload: ClientEventMap["room:participant:plan"],
    actionId?: string
  ): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    room.planParticipant(session.playerId, payload.playerId, payload.target);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private handleRoomSeatingCommit(
    ws: WebSocket,
    payload: ClientEventMap["room:seating:commit"],
    actionId?: string
  ): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    room.commitSeating(session.playerId, payload);

    const startMode = payload.startMode || "none";
    if (startMode === "start") {
      room.startGame(session.playerId);
    } else if (startMode === "restart") {
      room.restartRound(session.playerId);
    }

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private handleRoomLeave(ws: WebSocket, actionId?: string): void {
    const session = this.sessions.get(ws);
    if (!session) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "当前连接未加入房间");
    }

    this.unbindSocket(ws);
    this.removePlayerCompletely(session.roomId, session.playerId, "explicit_leave");

    this.sendAck(ws, {
      actionId,
      ok: true
    });
  }

  private handleGameStart(ws: WebSocket, actionId?: string): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    room.startGame(session.playerId);
    const state = room.getState();

    this.logDiagnostic("log", "game:start", {
      actionId: actionId || "",
      actorPlayerId: session.playerId,
      roomId: session.roomId,
      phase: state.phase,
      round: state.round,
      themeId: String(state.config?.themeId || ""),
      playerCount: state.players.length
    });

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private handleDiceRoll(ws: WebSocket, actionId?: string): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    const dice = room.rollForPlayer(session.playerId);

    this.sendToPlayer(session.roomId, session.playerId, "dice:privateResult", {
      round: room.getState().round,
      playerId: session.playerId,
      dice,
      serverTs: Date.now()
    });

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private handleDiceLock(ws: WebSocket, actionId?: string): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    room.lockDice(session.playerId);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private handleRollingFinish(ws: WebSocket, actionId?: string): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    const result = room.finishRolling(session.playerId);

    for (const entry of result.autoRolled) {
      this.sendToPlayer(session.roomId, entry.playerId, "dice:privateResult", {
        round: room.getState().round,
        playerId: entry.playerId,
        dice: entry.dice,
        serverTs: Date.now()
      });
    }

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private handleCallMake(
    ws: WebSocket,
    payload: ClientEventMap["call:make"],
    actionId?: string
  ): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    room.makeCall(session.playerId, payload.count, payload.point);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private async handleOpenRequest(
    ws: WebSocket,
    payload: ClientEventMap["open:request"],
    actionId?: string
  ): Promise<void> {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    const currentState = room.getState();
    const lastBy = currentState.lastCall?.by;

    if (payload.targetPlayerIds && payload.targetPlayerIds.length > 0) {
      const uniqueTargets = [...new Set(payload.targetPlayerIds)];
      if (uniqueTargets.length !== 1 || uniqueTargets[0] !== lastBy) {
        throw new GameError(ErrorCode.INVALID_OPEN_TARGET, "仅允许开上一手叫牌玩家");
      }
    }

    const { openResult, roundSummary } = room.openDice(session.playerId, room.getRuleOptionsForCurrentRound());

    await this.historyStore.saveRoundSummary(roundSummary);
    await this.accountStore.recordRoundSummary(roundSummary);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoom(session.roomId, "open:result", openResult);
    this.broadcastRoom(session.roomId, "round:summary", roundSummary);
    this.broadcastRoomState(session.roomId);
  }

  private async handleHistoryList(
    ws: WebSocket,
    payload: ClientEventMap["history:list"],
    actionId?: string
  ): Promise<void> {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    const { items, nextBeforeRound } = await this.historyStore.listHistory({
      roomId: session.roomId,
      limit: payload.limit ?? 3,
      beforeRound: payload.beforeRound
    });

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.send(ws, "history:list", {
      roomId: session.roomId,
      items,
      nextBeforeRound,
      serverTs: Date.now()
    });
  }

  private async sendLatestSummaryIfEnded(roomId: string, playerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    if (room.getState().phase !== "ended") {
      return;
    }

    try {
      const result = await this.historyStore.listHistory({
        roomId,
        limit: 1
      });
      const latest = result.items[0];
      if (!latest) {
        return;
      }

      this.sendToPlayer(roomId, playerId, "open:result", latest.openResult);
      this.sendToPlayer(roomId, playerId, "round:summary", latest);
    } catch {
      // ignore history load failure
    }
  }

  private async handleVoiceUpload(
    ws: WebSocket,
    payload: ClientEventMap["voice:upload"],
    actionId?: string
  ): Promise<void> {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    const state = room.getState();
    const turnKey = buildCallTurnKey(state);

    if (!payload || typeof payload.base64 !== "string" || !payload.base64.length) {
      throw new GameError(ErrorCode.BAD_REQUEST, "语音内容为空");
    }

    if (payload.base64.length > MAX_VOICE_BASE64_SIZE) {
      throw new GameError(ErrorCode.BAD_REQUEST, "语音内容过大，请缩短录音时长");
    }

    if (!Number.isFinite(payload.durationMs) || payload.durationMs <= 0) {
      throw new GameError(ErrorCode.BAD_REQUEST, "语音时长非法");
    }

    this.assertVoiceUploadAllowed(state, session.roomId, session.playerId, payload);

    const voiceMeta = await this.voiceStore.saveVoice({
      roomId: session.roomId,
      playerId: session.playerId,
      durationMs: payload.durationMs,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      base64: payload.base64
    });

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoom(session.roomId, "voice:uploaded", voiceMeta);
    void this.transcribeUploadedVoice(session.roomId, session.playerId, voiceMeta.fileId, payload, state, turnKey);
  }

  private async handleVoiceList(
    ws: WebSocket,
    payload: ClientEventMap["voice:list"],
    actionId?: string
  ): Promise<void> {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    const items = await this.voiceStore.listVoices(session.roomId, payload?.limit ?? 10);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.send(ws, "voice:list", {
      roomId: session.roomId,
      items,
      serverTs: Date.now()
    });
  }

  private async handleVoiceFetch(
    ws: WebSocket,
    payload: ClientEventMap["voice:fetch"],
    actionId?: string
  ): Promise<void> {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);

    if (!payload.fileId) {
      throw new GameError(ErrorCode.BAD_REQUEST, "缺少语音文件标识");
    }

    const voice = await this.voiceStore.fetchVoice(session.roomId, payload.fileId);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.send(ws, "voice:fetched", voice);
  }

  private async transcribeUploadedVoice(
    roomId: string,
    playerId: string,
    fileId: string,
    payload: ClientEventMap["voice:upload"],
    stateAtUpload: RoomStateDTO,
    turnKey: string
  ): Promise<void> {
    const guardKey = this.playerKey(roomId, playerId);

    if (!this.voiceTranscriber.isEnabled()) {
      const guard = this.voiceTurnGuards.get(guardKey);
      this.sendToPlayer(roomId, playerId, "voice:transcribed", {
        roomId,
        playerId,
        fileId,
        clientRequestId: payload.clientRequestId,
        ok: false,
        reason: "语音识别服务未配置",
        attemptsRemaining: guard ? Math.max(0, VOICE_MAX_ATTEMPTS_PER_TURN - guard.attemptsUsed) : VOICE_MAX_ATTEMPTS_PER_TURN,
        invalidStreak: guard?.invalidStreak || 0,
        disabledForTurn: Boolean(guard?.locked),
        serverTs: Date.now()
      });
      return;
    }

    try {
      const text = await this.voiceTranscriber.transcribe({
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        base64: payload.base64
      });
      const transcript = String(text || "").trim();
      const parsed = parseVoiceCallInput(transcript);
      const guard = this.voiceTurnGuards.get(guardKey);

      if (!parsed) {
        const nextInvalidStreak = guard && guard.turnKey === turnKey ? guard.invalidStreak + 1 : 1;
        if (guard && guard.turnKey === turnKey) {
          guard.invalidStreak = nextInvalidStreak;
          guard.locked = nextInvalidStreak >= VOICE_MAX_INVALID_ATTEMPTS_PER_TURN;
          this.voiceTurnGuards.set(guardKey, guard);
        }

        this.sendToPlayer(roomId, playerId, "voice:transcribed", {
          roomId,
          playerId,
          fileId,
          clientRequestId: payload.clientRequestId,
          ok: false,
          text: transcript,
          reason: guard?.locked
            ? "连续3次未识别到有效叫牌，本轮请直接手动叫牌"
            : "没识别到有效叫牌，请直接说“六个四”这种格式",
          attemptsRemaining: guard ? Math.max(0, VOICE_MAX_ATTEMPTS_PER_TURN - guard.attemptsUsed) : 0,
          invalidStreak: guard?.invalidStreak || nextInvalidStreak,
          disabledForTurn: Boolean(guard?.locked),
          serverTs: Date.now()
        });
        return;
      }

      if (!isVoiceCallLegalForState(stateAtUpload, parsed.count, parsed.point)) {
        const nextInvalidStreak = guard && guard.turnKey === turnKey ? guard.invalidStreak + 1 : 1;
        if (guard && guard.turnKey === turnKey) {
          guard.invalidStreak = nextInvalidStreak;
          guard.locked = nextInvalidStreak >= VOICE_MAX_INVALID_ATTEMPTS_PER_TURN;
          this.voiceTurnGuards.set(guardKey, guard);
        }

        this.sendToPlayer(roomId, playerId, "voice:transcribed", {
          roomId,
          playerId,
          fileId,
          clientRequestId: payload.clientRequestId,
          ok: false,
          text: transcript,
          reason: guard?.locked
            ? "连续3次无效叫牌，本轮请直接手动叫牌"
            : "识别到了，但这手叫牌不合法，请按大于上一手的格式说",
          attemptsRemaining: guard ? Math.max(0, VOICE_MAX_ATTEMPTS_PER_TURN - guard.attemptsUsed) : 0,
          invalidStreak: guard?.invalidStreak || nextInvalidStreak,
          disabledForTurn: Boolean(guard?.locked),
          serverTs: Date.now()
        });
        return;
      }

      if (guard && guard.turnKey === turnKey) {
        guard.invalidStreak = 0;
        guard.locked = false;
        this.voiceTurnGuards.set(guardKey, guard);
      }

      this.sendToPlayer(roomId, playerId, "voice:transcribed", {
        roomId,
        playerId,
        fileId,
        clientRequestId: payload.clientRequestId,
        ok: true,
        text: transcript,
        count: parsed.count,
        point: parsed.point,
        attemptsRemaining: guard ? Math.max(0, VOICE_MAX_ATTEMPTS_PER_TURN - guard.attemptsUsed) : 0,
        invalidStreak: 0,
        disabledForTurn: false,
        serverTs: Date.now()
      });
    } catch (error) {
      const guard = this.voiceTurnGuards.get(guardKey);
      const reason = error instanceof Error && error.message
        ? error.message
        : "语音识别失败，请重试";

      this.sendToPlayer(roomId, playerId, "voice:transcribed", {
        roomId,
        playerId,
        fileId,
        clientRequestId: payload.clientRequestId,
        ok: false,
        reason,
        attemptsRemaining: guard ? Math.max(0, VOICE_MAX_ATTEMPTS_PER_TURN - guard.attemptsUsed) : VOICE_MAX_ATTEMPTS_PER_TURN,
        invalidStreak: guard?.invalidStreak || 0,
        disabledForTurn: Boolean(guard?.locked),
        serverTs: Date.now()
      });
    }
  }

  private handleHeartbeat(
    ws: WebSocket,
    payload: ClientEventMap["system:heartbeat"],
    actionId?: string
  ): void {
    const ts = Number(payload && payload.ts);
    if (!Number.isFinite(ts) || ts <= 0) {
      throw new GameError(ErrorCode.BAD_REQUEST, "心跳时间戳无效");
    }

    this.sendAck(ws, {
      actionId,
      ok: true
    });
  }

  private handleRoundRestart(ws: WebSocket, actionId?: string): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    room.restartRound(session.playerId);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private handleTestSetSeed(
    ws: WebSocket,
    payload: ClientEventMap["test:setSeed"],
    actionId?: string
  ): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    room.setTestSeed(session.playerId, payload.seed);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private handleTestSetNextDice(
    ws: WebSocket,
    payload: ClientEventMap["test:setNextDice"],
    actionId?: string
  ): void {
    const { room, session } = this.getRoomAndSession(ws);
    this.ensureActivePlayer(room, session.playerId);
    room.setNextDice(session.playerId, payload.dice, payload.playerId);

    this.sendAck(ws, {
      actionId,
      ok: true
    });

    this.broadcastRoomState(session.roomId);
  }

  private async resolveBoundAccount(payload: {
    accountId?: string;
    accountSessionToken?: string;
  }): Promise<BoundAccountIdentity | null> {
    const accountId = String(payload.accountId || "").trim();
    const accountSessionToken = String(payload.accountSessionToken || "").trim();

    if (!accountId && !accountSessionToken) {
      return null;
    }

    if (!accountId || !accountSessionToken) {
      throw new GameError(ErrorCode.FORBIDDEN, "账号登录已失效，请重新进入");
    }

    const profile = await this.accountStore.verifySession(accountId, accountSessionToken);
    if (!profile) {
      throw new GameError(ErrorCode.FORBIDDEN, "账号登录已失效，请重新进入");
    }

    return {
      accountId: profile.accountId,
      accountDisplayId: profile.displayId,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl
    };
  }

  private getBoundAccountId(room: RoomEngine, playerId: string): string | undefined {
    const state = room.getState();
    const active = state.players.find((player) => player.id === playerId);
    if (active?.accountId) {
      return active.accountId;
    }

    return state.spectators.find((player) => player.id === playerId)?.accountId;
  }

  private findRoomParticipantByAccountId(
    room: RoomEngine,
    accountId: string,
    options: { includeOnline?: boolean } = {}
  ): { id: string; kind: "player" | "spectator" } | null {
    const normalizedAccountId = String(accountId || "").trim();
    if (!normalizedAccountId) {
      return null;
    }

    const includeOnline = options.includeOnline !== false;
    const state = room.getState();
    const active = state.players.find((player) => {
      if (String(player.accountId || "").trim() !== normalizedAccountId) {
        return false;
      }
      if (includeOnline) {
        return true;
      }
      return player.onlineStatus !== "online";
    });
    if (active) {
      return {
        id: active.id,
        kind: "player"
      };
    }

    const spectator = state.spectators.find((player) => String(player.accountId || "").trim() === normalizedAccountId);
    if (spectator) {
      return {
        id: spectator.id,
        kind: "spectator"
      };
    }

    return null;
  }

  private hasOnlineRoomParticipantByAccountId(room: RoomEngine, accountId: string): boolean {
    const normalizedAccountId = String(accountId || "").trim();
    if (!normalizedAccountId) {
      return false;
    }

    const state = room.getState();
    return state.players.some((player) => (
      player.accountId === normalizedAccountId && player.onlineStatus === "online"
    )) || state.spectators.some((player) => (
      player.accountId === normalizedAccountId && player.onlineStatus === "online"
    ));
  }

  private getRoomAndSession(ws: WebSocket): { room: RoomEngine; session: Session } {
    const session = this.sessions.get(ws);
    if (!session) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "当前连接未加入房间");
    }

    const room = this.rooms.get(session.roomId);
    if (!room) {
      throw new GameError(ErrorCode.ROOM_NOT_FOUND, "房间不存在");
    }

    if (!room.hasParticipant(session.playerId)) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "玩家不在房间中");
    }

    return {
      room,
      session
    };
  }

  private ensureActivePlayer(room: RoomEngine, playerId: string): void {
    if (!room.hasPlayer(playerId)) {
      throw new GameError(ErrorCode.FORBIDDEN, "旁观者不可操作");
    }
  }

  private ensureSocketNotInRoom(ws: WebSocket): void {
    if (this.sessions.has(ws)) {
      throw new GameError(ErrorCode.BAD_REQUEST, "当前连接已在房间中");
    }
  }

  private prepareSocketForCreateOrJoin(ws: WebSocket): void {
    const existing = this.sessions.get(ws);
    if (!existing) {
      return;
    }

    this.unbindSocket(ws);
    this.removePlayerCompletely(existing.roomId, existing.playerId, "switch_room");
  }

  private ensureOwnerCanCreateRoom(ws: WebSocket, actionId?: string): void {
    const existing = this.sessions.get(ws);
    if (!existing) {
      return;
    }

    const room = this.rooms.get(existing.roomId);
    if (!room || !room.hasParticipant(existing.playerId)) {
      return;
    }

    const existingPlayer = room.getState().players.find((player) => player.id === existing.playerId);
    if (!existingPlayer?.isOwner) {
      return;
    }

    this.logDiagnostic("warn", "room:create:blocked_existing_owner", {
      actionId: actionId || "",
      playerId: existing.playerId,
      ...this.getRoomDiagnostics(existing.roomId),
      ...this.getSocketMeta(ws)
    });
    throw new GameError(ErrorCode.BAD_REQUEST, "你已在房间中，请先离开当前房间");
  }

  private bindSession(ws: WebSocket, roomId: string, playerId: string): void {
    const key = this.playerKey(roomId, playerId);
    const previousSocket = this.socketsByPlayerKey.get(key);

    if (previousSocket && previousSocket !== ws) {
      this.sessions.delete(previousSocket);
      try {
        previousSocket.close();
      } catch {
        // ignore close failure
      }
    }

    const session: Session = { roomId, playerId };
    this.sessions.set(ws, session);
    this.socketsByPlayerKey.set(key, ws);
  }

  private unbindSocket(ws: WebSocket): Session | undefined {
    const session = this.sessions.get(ws);
    if (!session) {
      return undefined;
    }

    this.sessions.delete(ws);
    const key = this.playerKey(session.roomId, session.playerId);

    const bound = this.socketsByPlayerKey.get(key);
    if (bound === ws) {
      this.socketsByPlayerKey.delete(key);
    }

    return session;
  }

  private handleSocketDisconnected(ws: WebSocket): void {
    const session = this.unbindSocket(ws);
    if (!session) {
      return;
    }

    const room = this.rooms.get(session.roomId);
    if (!room || !room.hasParticipant(session.playerId)) {
      return;
    }

    room.setPlayerOnlineStatus(session.playerId, "offline");
    const preserveRoom = this.shouldPreserveReadyOwnerRoom(session.roomId, session.playerId);
    const graceMs = preserveRoom ? null : RECONNECT_GRACE_MS;
    this.logDiagnostic("log", "socket:disconnected", {
      playerId: session.playerId,
      reconnectGraceMs: graceMs,
      preserveReadyOwnerRoom: preserveRoom,
      ...this.getRoomDiagnostics(session.roomId),
      ...this.getSocketMeta(ws)
    });
    this.broadcastRoomState(session.roomId);
    if (!preserveRoom) {
      this.scheduleReconnectDeadline(session.roomId, session.playerId, RECONNECT_GRACE_MS);
    }
  }

  private scheduleReconnectDeadline(roomId: string, playerId: string, graceMs = RECONNECT_GRACE_MS): void {
    this.clearReconnectTimer(roomId, playerId);

    const timer = setTimeout(() => {
      this.finalizeDisconnectedPlayer(roomId, playerId);
    }, graceMs);

    this.reconnectTimers.set(this.playerKey(roomId, playerId), timer);
  }

  private shouldPreserveReadyOwnerRoom(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    const state = room.getState();
    const player = state.players.find((item) => item.id === playerId);
    return Boolean(
      player &&
      player.isOwner &&
      state.phase === "ready" &&
      state.players.length === 1 &&
      state.spectators.length === 0
    );
  }

  private clearReconnectTimer(roomId: string, playerId: string): void {
    const key = this.playerKey(roomId, playerId);
    const timer = this.reconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(key);
    }
  }

  private finalizeDisconnectedPlayer(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      this.clearReconnectTimer(roomId, playerId);
      this.playerResumeTokens.delete(this.playerKey(roomId, playerId));
      return;
    }

    if (!room.hasParticipant(playerId)) {
      this.clearReconnectTimer(roomId, playerId);
      this.playerResumeTokens.delete(this.playerKey(roomId, playerId));
      return;
    }

    const playerState = room.getState().players.find((player) => player.id === playerId);
    if (playerState?.onlineStatus === "online") {
      this.clearReconnectTimer(roomId, playerId);
      return;
    }

    const phase = room.getState().phase;
    const roundActive = phase === "rolling" || phase === "calling" || phase === "opening";
    if (roundActive) {
      // Keep them in the round for counting; mark as pending removal until next round starts.
      this.clearReconnectTimer(roomId, playerId);
      this.logDiagnostic("warn", "player:finalize_disconnect:deferred", {
        playerId,
        reason: "round_active",
        ...this.getRoomDiagnostics(roomId)
      });
      room.removePlayer(playerId);
      this.broadcastRoomState(roomId);
      return;
    }

    this.logDiagnostic("warn", "player:finalize_disconnect:remove", {
      playerId,
      reason: "grace_timeout",
      ...this.getRoomDiagnostics(roomId)
    });
    this.removePlayerCompletely(roomId, playerId, "grace_timeout");
  }

  private removePlayerCompletely(roomId: string, playerId: string, reason: PlayerRemovalReason): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    if (reason !== "explicit_leave" && this.shouldPreserveReadyOwnerRoom(roomId, playerId)) {
      this.clearReconnectTimer(roomId, playerId);
      room.setPlayerOnlineStatus(playerId, "offline");
      this.logDiagnostic("warn", "room:preserved_ready_owner", {
        playerId,
        reason,
        ...this.getRoomDiagnostics(roomId)
      });
      this.broadcastRoomState(roomId);
      return;
    }

    this.clearReconnectTimer(roomId, playerId);
    this.playerResumeTokens.delete(this.playerKey(roomId, playerId));
    this.voiceTurnGuards.delete(this.playerKey(roomId, playerId));

    const stateBeforeRemoval = room.getState();
    const shouldAutoAdvanceLeavingTurn = Boolean(
      reason === "explicit_leave"
      && stateBeforeRemoval.phase === "calling"
      && stateBeforeRemoval.currentPlayerId === playerId
    );

    room.removePlayer(playerId, {
      preserveCurrentTurn: shouldAutoAdvanceLeavingTurn
    });

    this.logDiagnostic("log", "room:player_removed", {
      playerId,
      reason,
      ...this.getRoomDiagnostics(roomId)
    });

    if (room.isEmpty()) {
      this.logDiagnostic("warn", "room:deleted", {
        playerId,
        reason: `room_empty:${reason}`,
        ...this.getRoomDiagnostics(roomId)
      });
      this.rooms.delete(roomId);
      this.cleanupRoomResources(roomId);
      return;
    }

    if (shouldAutoAdvanceLeavingTurn) {
      void this.autoAdvanceCurrentCallTurn(roomId, playerId).catch(() => {
        this.broadcastRoomState(roomId);
      });
    } else {
      this.broadcastRoomState(roomId);
    }
  }

  private cleanupRoomResources(roomId: string): void {
    for (const key of this.playerResumeTokens.keys()) {
      if (key.startsWith(`${roomId}:`)) {
        this.playerResumeTokens.delete(key);
      }
    }

    for (const key of this.reconnectTimers.keys()) {
      if (key.startsWith(`${roomId}:`)) {
        const timer = this.reconnectTimers.get(key);
        if (timer) {
          clearTimeout(timer);
        }
        this.reconnectTimers.delete(key);
      }
    }

    const turnTimer = this.turnTimers.get(roomId);
    if (turnTimer) {
      clearTimeout(turnTimer);
      this.turnTimers.delete(roomId);
    }
    this.turnTimerKeys.delete(roomId);
    this.turnDeadlineTsByRoom.delete(roomId);
    for (const key of this.voiceTurnGuards.keys()) {
      if (key.startsWith(`${roomId}:`)) {
        this.voiceTurnGuards.delete(key);
      }
    }
    this.chatStore.clearRoom(roomId);
  }

  private assertVoiceUploadAllowed(
    state: RoomStateDTO,
    roomId: string,
    playerId: string,
    payload: ClientEventMap["voice:upload"]
  ): void {
    if (state.phase !== "calling") {
      throw new GameError(ErrorCode.INVALID_PHASE, "叫牌阶段才能使用语音");
    }

    if (String(state.currentPlayerId || "") !== String(playerId || "")) {
      throw new GameError(ErrorCode.NOT_YOUR_TURN, "仅轮到你叫牌时可语音");
    }

    const durationMs = Number(payload.durationMs || 0);
    if (!Number.isFinite(durationMs) || durationMs < MIN_VOICE_DURATION_MS) {
      throw new GameError(ErrorCode.BAD_REQUEST, "录音太短，请重说");
    }

    if (durationMs > MAX_CALL_VOICE_DURATION_MS) {
      throw new GameError(ErrorCode.BAD_REQUEST, "语音请控制在5秒内");
    }

    const now = Date.now();
    const key = this.playerKey(roomId, playerId);
    const turnKey = buildCallTurnKey(state);
    const existing = this.voiceTurnGuards.get(key);
    const guard: VoiceTurnGuard = existing && existing.turnKey === turnKey
      ? existing
      : {
        turnKey,
        attemptsUsed: 0,
        invalidStreak: 0,
        locked: false,
        lastAttemptAt: 0,
        recentAttemptTimestamps: existing?.recentAttemptTimestamps || []
      };

    guard.recentAttemptTimestamps = guard.recentAttemptTimestamps.filter((ts) => now - ts < VOICE_WINDOW_MS);

    if (guard.locked || guard.invalidStreak >= VOICE_MAX_INVALID_ATTEMPTS_PER_TURN) {
      throw new GameError(ErrorCode.LOCKED, "连续3次无效叫牌，本轮请直接手动叫牌");
    }

    if (guard.attemptsUsed >= VOICE_MAX_ATTEMPTS_PER_TURN) {
      throw new GameError(ErrorCode.LOCKED, "本轮语音最多尝试3次，请直接手动叫牌");
    }

    const elapsedMs = now - Number(guard.lastAttemptAt || 0);
    if (guard.lastAttemptAt > 0 && elapsedMs < VOICE_MIN_INTERVAL_MS) {
      const waitSec = Math.max(1, Math.ceil((VOICE_MIN_INTERVAL_MS - elapsedMs) / 1000));
      throw new GameError(ErrorCode.LOCKED, `语音过于频繁，请${waitSec}秒后再试`);
    }

    if (guard.recentAttemptTimestamps.length >= VOICE_MAX_ATTEMPTS_PER_MINUTE) {
      throw new GameError(ErrorCode.LOCKED, "语音次数过多，请稍后再试");
    }

    guard.attemptsUsed += 1;
    guard.lastAttemptAt = now;
    guard.recentAttemptTimestamps.push(now);
    this.voiceTurnGuards.set(key, guard);
  }

  private createOrRefreshResumeToken(roomId: string, playerId: string): string {
    const token = createResumeToken();
    this.playerResumeTokens.set(this.playerKey(roomId, playerId), token);
    return token;
  }

  private verifyResumeToken(roomId: string, playerId: string, resumeToken: string): boolean {
    const saved = this.playerResumeTokens.get(this.playerKey(roomId, playerId));
    return Boolean(saved && saved === resumeToken);
  }

  private broadcastRoomState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    this.rescheduleTurnTimer(roomId);
    const state = room.getState();
    const themeManifest = getRoomThemeManifest(state.config.themeId, state.config.themeVersion);
    this.broadcastRoom(roomId, "room:state", {
      ...state,
      themeManifest,
      turnDeadlineTs: this.turnDeadlineTsByRoom.get(roomId)
    });
  }

  private rescheduleTurnTimer(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      const existing = this.turnTimers.get(roomId);
      if (existing) {
        clearTimeout(existing);
        this.turnTimers.delete(roomId);
      }
      this.turnTimerKeys.delete(roomId);
      this.turnDeadlineTsByRoom.delete(roomId);
      return;
    }

    const state = room.getState();
    const turnKey = buildCallTurnKey(state);

    if (this.turnTimerKeys.get(roomId) === turnKey) {
      if (state.phase === "calling") {
        const activeDeadlineTs = this.turnDeadlineTsByRoom.get(roomId) || 0;
        const remainingMs = activeDeadlineTs - Date.now();
        if (remainingMs < CALL_TIMEOUT_MS - 500) {
          this.scheduleCallTurnTimer(roomId, turnKey, state.currentPlayerId!);
        }
      }
      return;
    }

    this.turnTimerKeys.set(roomId, turnKey);

    const existing = this.turnTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.turnTimers.delete(roomId);
    }

    if (!state.currentPlayerId) {
      this.turnDeadlineTsByRoom.delete(roomId);
      return;
    }

    if (state.phase === "calling") {
      this.scheduleCallTurnTimer(roomId, turnKey, state.currentPlayerId!);
      return;
    }

    this.turnDeadlineTsByRoom.delete(roomId);
  }

  private scheduleCallTurnTimer(roomId: string, turnKey: string, playerId: string): void {
    const existing = this.turnTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.turnTimers.delete(roomId);
    }

    const deadlineTs = Date.now() + CALL_TIMEOUT_MS;
    this.turnDeadlineTsByRoom.set(roomId, deadlineTs);
    const timer = setTimeout(() => {
      void this.handleCallTimeout(roomId, turnKey, playerId, deadlineTs);
    }, CALL_TIMEOUT_MS);
    this.turnTimers.set(roomId, timer);
  }

  private handleRollTimeout(roomId: string, version: number, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const state = room.getState();
    if (state.version !== version || state.phase !== "calling" || state.currentPlayerId !== playerId) {
      return;
    }

    const currentPlayer = (state.players || []).find((p) => p.id === playerId);
    if (currentPlayer?.diceCupStatus === "open") {
      return;
    }

    try {
      const dice = room.rollForPlayer(playerId);
      this.sendToPlayer(roomId, playerId, "dice:privateResult", {
        round: room.getState().round,
        playerId,
        dice,
        serverTs: Date.now()
      });
      this.broadcastRoomState(roomId);
    } catch {
      // ignore timeout failure
    }
  }

  private async handleCallTimeout(
    roomId: string,
    expectedTurnKey: string,
    playerId: string,
    expectedDeadlineTs = 0
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const activeDeadlineTs = this.turnDeadlineTsByRoom.get(roomId) || 0;
    if (
      expectedDeadlineTs > 0
      && (activeDeadlineTs !== expectedDeadlineTs || Date.now() < expectedDeadlineTs)
    ) {
      return;
    }

    const state = room.getState();
    const currentTurnKey = buildCallTurnKey(state);
    if (currentTurnKey !== expectedTurnKey || state.phase !== "calling" || state.currentPlayerId !== playerId) {
      return;
    }

    try {
      await this.autoAdvanceCurrentCallTurn(roomId, playerId);
    } catch {
      // ignore timeout failure
    }
  }

  private async autoAdvanceCurrentCallTurn(roomId: string, playerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const state = room.getState();
    if (state.phase !== "calling" || state.currentPlayerId !== playerId) {
      this.broadcastRoomState(roomId);
      return;
    }

    const suggestion = room.getAutoCallSuggestion();
    if (suggestion) {
      room.makeCall(playerId, suggestion.count, suggestion.point);
      this.broadcastRoomState(roomId);
      return;
    }

    const { openResult, roundSummary } = room.openDice(playerId, room.getRuleOptionsForCurrentRound());
    await this.historyStore.saveRoundSummary(roundSummary);
    await this.accountStore.recordRoundSummary(roundSummary);
    this.broadcastRoom(roomId, "open:result", openResult);
    this.broadcastRoom(roomId, "round:summary", roundSummary);
    this.broadcastRoomState(roomId);
  }

  private sendToPlayer<E extends keyof ServerEventMap>(
    roomId: string,
    playerId: string,
    event: E,
    payload: ServerEventMap[E]
  ): void {
    const ws = this.socketsByPlayerKey.get(this.playerKey(roomId, playerId));
    if (!ws) {
      return;
    }

    this.send(ws, event, payload);
  }

  private broadcastRoom<E extends keyof ServerEventMap>(
    roomId: string,
    event: E,
    payload: ServerEventMap[E]
  ): void {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.roomId === roomId) {
        this.send(ws, event, payload);
      }
    }
  }

  private sendAck(ws: WebSocket, payload: ServerEventMap["action:ack"]): void {
    this.send(ws, "action:ack", payload);
  }

  private sendSystemError(ws: WebSocket, code: string, message: string): void {
    this.send(ws, "system:error", {
      code,
      message,
      serverTs: Date.now()
    });
  }

  private handleError(ws: WebSocket, actionId: string | undefined, error: unknown): void {
    if (error instanceof GameError) {
      this.send(ws, "action:ack", {
        actionId,
        ok: false,
        code: error.code,
        reason: error.message
      });
      return;
    }

    this.send(ws, "action:ack", {
      actionId,
      ok: false,
      code: ErrorCode.INTERNAL_ERROR,
      reason: "服务器异常"
    });
  }

  private send<E extends keyof ServerEventMap>(
    ws: WebSocket,
    event: E,
    payload: ServerEventMap[E]
  ): void {
    const packet: ServerMessage<E> = {
      event,
      payload
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(packet));
    }
  }

  private isValidClientEvent(event: unknown): event is ClientEventName {
    return typeof event === "string" && CLIENT_EVENTS.includes(event as ClientEventName);
  }

  private playerKey(roomId: string, playerId: string): string {
    return `${roomId}:${playerId}`;
  }
}
