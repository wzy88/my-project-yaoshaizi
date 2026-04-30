import {
  ErrorCode,
  GameError,
  getPointCountBreakdown,
  isCallHigher,
  isValidCallInput,
  type DiceCall,
  type OpenResultDTO,
  type RoomConfigDTO,
  type RoomDirection,
  type RoomThemeId,
  type PlayerState,
  type RoomPhase,
  type RoomStateDTO,
  type RoundSummaryDTO,
  type RuleOptions,
  type WaitingPlayerState
} from "@dice/shared";

import { DEFAULT_DICE_PER_PLAYER, MAX_PLAYERS, MIN_PLAYERS_TO_START } from "../config.js";
import { rollDice } from "../utils/random.js";

interface AddPlayerInput {
  id: string;
  accountId?: string;
  accountDisplayId?: string;
  nickname: string;
  avatar: string;
  isOwner?: boolean;
}

interface InternalPlayer extends PlayerState {
  privateDice: number[];
  hasRolled: boolean;
  hasBidThisRound: boolean;
  rollCountThisRound: number;
  pendingRemoval: boolean;
}

interface OpenExecution {
  openResult: OpenResultDTO;
  roundSummary: RoundSummaryDTO;
}

interface RemovePlayerOptions {
  preserveCurrentTurn?: boolean;
}

class SeededRng {
  private state: number;

  constructor(seed: number) {
    // xorshift32 requires non-zero seed
    const normalized = (Number(seed) | 0) >>> 0;
    this.state = normalized === 0 ? 0x6d2b79f5 : normalized;
  }

  nextUint32(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    const min = Number(minInclusive);
    const max = Number(maxExclusive);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return minInclusive;
    }

    const range = max - min;
    return min + (this.nextUint32() % range);
  }
}

const DEFAULT_ROOM_THEME_ID: RoomThemeId = "jade-green";
const ROOM_THEME_IDS = new Set<RoomThemeId>(["jade-green", "ruby-red", "imperial-red"]);

function normalizeRoomThemeId(input: unknown): RoomThemeId {
  const value = String(input || "").trim() as RoomThemeId;
  return ROOM_THEME_IDS.has(value) ? value : DEFAULT_ROOM_THEME_ID;
}

export class RoomEngine {
  readonly roomId: string;

  private players = new Map<string, InternalPlayer>();
  private waitingPlayers = new Map<string, WaitingPlayerState>();
  private phase: RoomPhase = "ready";
  private round = 0;
  private currentPlayerId?: string;
  private lastCall?: DiceCall;
  private config: RoomConfigDTO;
  private configLocked = false;
  private wildcardOneLockedOff = false;
  private nextRoundStarterId?: string;
  private testSeed?: number;
  private rng?: SeededRng;
  private nextDiceOverride = new Map<string, number[]>();
  private version = 1;

  constructor(roomId: string, owner: AddPlayerInput, config: RoomConfigDTO) {
    this.roomId = roomId;
    this.config = this.normalizeConfig(config);
    this.addPlayer({ ...owner, isOwner: true });
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  hasParticipant(playerId: string): boolean {
    return this.players.has(playerId) || this.waitingPlayers.has(playerId);
  }

  updatePlayerProfile(actorId: string, patch: { nickname?: string; avatar?: string }): void {
    const nicknameRaw = patch.nickname == null ? "" : String(patch.nickname);
    const nickname = nicknameRaw.trim();

    const waiting = this.waitingPlayers.get(actorId);
    if (waiting) {
      if (nickname) {
        waiting.nickname = nickname;
      }
      if (patch.avatar != null) {
        waiting.avatar = String(patch.avatar || "").trim();
      }
      this.bumpVersion();
      return;
    }

    const player = this.players.get(actorId);
    if (!player) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "玩家不在房间中");
    }

    if (nickname) {
      player.nickname = nickname;
    }
    if (patch.avatar != null) {
      player.avatar = String(patch.avatar || "").trim();
    }

    this.bumpVersion();
  }

  setPlayerOnlineStatus(playerId: string, status: "online" | "offline"): void {
    const waiting = this.waitingPlayers.get(playerId);
    if (waiting) {
      waiting.onlineStatus = status;
      this.bumpVersion();
      return;
    }

    const player = this.getPlayerOrThrow(playerId);

    if (player.onlineStatus === status) {
      return;
    }

    player.onlineStatus = status;

    if (status === "offline") {
      player.turnStatus = "idle";
      if (this.currentPlayerId === playerId) {
        this.currentPlayerId = undefined;
      }
    } else {
      player.pendingRemoval = false;
    }

    if (
      this.getOnlinePlayers().length < MIN_PLAYERS_TO_START &&
      (this.phase === "rolling" || this.phase === "calling" || this.phase === "opening")
    ) {
      this.phase = "ready";
      this.resetRoundState();
    } else {
      this.repairTurnAfterPlayerChange();
    }

    this.bumpVersion();
  }

  getState(): RoomStateDTO {
    const players = [...this.players.values()]
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map(({
        privateDice: _privateDice,
        hasRolled: _hasRolled,
        hasBidThisRound: _hasBidThisRound,
        pendingRemoval: _pendingRemoval,
        ...publicState
      }) => publicState);

    const waitingPlayers = [...this.waitingPlayers.values()].sort((a, b) => a.nickname.localeCompare(b.nickname));

    return {
      roomId: this.roomId,
      phase: this.phase,
      round: this.round,
      currentPlayerId: this.currentPlayerId,
      config: this.config,
      players,
      waitingPlayers,
      lastCall: this.lastCall,
      networkHealth: "good",
      version: this.version,
      serverTs: Date.now()
    };
  }

  addPlayer(input: AddPlayerInput): void {
    if (this.players.size + this.waitingPlayers.size >= MAX_PLAYERS) {
      throw new GameError(ErrorCode.ROOM_FULL, "房间人数已达上限");
    }

    if (this.players.has(input.id)) {
      throw new GameError(ErrorCode.BAD_REQUEST, "玩家已在房间中");
    }

    const seatIndex = this.allocateSeatIndex();

    const player: InternalPlayer = {
      id: input.id,
      accountId: input.accountId,
      accountDisplayId: input.accountDisplayId,
      nickname: input.nickname,
      avatar: input.avatar,
      isOwner: Boolean(input.isOwner),
      onlineStatus: "online",
      turnStatus: "idle",
      seatIndex,
      diceCupStatus: "closed",
      rollLocked: false,
      currentCall: undefined,
      privateDice: [],
      hasRolled: false,
      hasBidThisRound: false,
      rollCountThisRound: 0,
      pendingRemoval: false
    };

    this.players.set(player.id, player);

    if (!this.currentPlayerId && this.phase === "ready") {
      this.currentPlayerId = player.id;
      player.turnStatus = "active";
    }

    this.bumpVersion();
  }

  addWaitingPlayer(input: Omit<AddPlayerInput, "isOwner">): void {
    if (this.players.size + this.waitingPlayers.size >= MAX_PLAYERS) {
      throw new GameError(ErrorCode.ROOM_FULL, "房间人数已达上限");
    }

    if (this.players.has(input.id) || this.waitingPlayers.has(input.id)) {
      throw new GameError(ErrorCode.BAD_REQUEST, "玩家已在房间中");
    }

    this.waitingPlayers.set(input.id, {
      id: input.id,
      accountId: input.accountId,
      accountDisplayId: input.accountDisplayId,
      nickname: input.nickname,
      avatar: input.avatar,
      onlineStatus: "online"
    });
    this.bumpVersion();
  }

  removePlayer(playerId: string, options: RemovePlayerOptions = {}): void {
    if (this.waitingPlayers.delete(playerId)) {
      this.bumpVersion();
      return;
    }

    const removed = this.players.get(playerId);
    if (!removed) {
      return;
    }

    const isRoundActive = this.phase === "rolling" || this.phase === "calling" || this.phase === "opening";
    if (isRoundActive) {
      const removedWasOwner = removed.isOwner;
      removed.onlineStatus = "offline";
      removed.turnStatus = "idle";
      removed.pendingRemoval = true;

      if (removedWasOwner) {
        removed.isOwner = false;
        this.ensureRoomHasOwner();
      }

      if (this.getOnlinePlayers().length < MIN_PLAYERS_TO_START) {
        this.abortActiveRoundToReady();
        this.bumpVersion();
        return;
      }

      if (this.currentPlayerId === playerId && !options.preserveCurrentTurn) {
        this.currentPlayerId = undefined;
      }
      this.repairTurnAfterPlayerChange();
      this.bumpVersion();
      return;
    }

    const removedWasOwner = removed.isOwner;
    this.players.delete(playerId);

    if (this.players.size === 0) {
      this.currentPlayerId = undefined;
      this.lastCall = undefined;
      this.phase = "ready";
      this.bumpVersion();
      return;
    }

    if (removedWasOwner) {
      this.ensureRoomHasOwner();
    }

    if (this.currentPlayerId === playerId) {
      this.currentPlayerId = undefined;
    }

    if (this.getOnlinePlayers().length < MIN_PLAYERS_TO_START) {
      this.phase = "ready";
      this.resetRoundState();
    }

    this.repairTurnAfterPlayerChange();
    this.bumpVersion();
  }

  updateConfig(actorId: string, patch: Partial<Pick<RoomConfigDTO, "direction" | "wildcardOneEnabled" | "dicePerPlayer" | "minOpeningCount">>): void {
    this.ensureOwner(actorId);

    const phaseAllowsUpdate = this.phase === "ready" || this.phase === "ended";
    if (!phaseAllowsUpdate) {
      throw new GameError(ErrorCode.INVALID_PHASE, "当前阶段无法修改房间配置");
    }

    if (this.configLocked) {
      const keys = Object.keys(patch);
      const onlyDicePerPlayer = keys.length > 0 && keys.every((key) => key === "dicePerPlayer");
      if (!onlyDicePerPlayer) {
        throw new GameError(ErrorCode.LOCKED, "已开局，房间配置已锁定");
      }
    }

    this.config = this.normalizeConfig({
      ...this.config,
      ...patch
    });

    this.bumpVersion();
  }

  setSeat(actorId: string, playerId: string, seatIndex: number): void {
    this.ensureOwner(actorId);

    const phaseAllowsSeat = this.phase === "ready" || this.phase === "ended";
    if (!phaseAllowsSeat) {
      throw new GameError(ErrorCode.INVALID_PHASE, "仅准备/结算阶段可排位");
    }

    const target = this.players.get(playerId);
    if (!target) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "玩家不在对局中");
    }

    const normalizedSeat = this.normalizeSeatIndex(seatIndex);

    const occupied = [...this.players.values()].find((p) => p.seatIndex === normalizedSeat);
    if (occupied && occupied.id !== target.id) {
      throw new GameError(ErrorCode.SEAT_CONFLICT, "座位已被占用");
    } else {
      target.seatIndex = normalizedSeat;
    }

    this.bumpVersion();
  }

  swapSeats(actorId: string, playerIdA: string, playerIdB: string): void {
    this.ensureOwner(actorId);

    const phaseAllowsSeat = this.phase === "ready" || this.phase === "ended";
    if (!phaseAllowsSeat) {
      throw new GameError(ErrorCode.INVALID_PHASE, "仅准备/结算阶段可排位");
    }

    const a = this.players.get(playerIdA);
    const b = this.players.get(playerIdB);
    if (!a || !b) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "玩家不在对局中");
    }

    if (!a.seatIndex || !b.seatIndex) {
      throw new GameError(ErrorCode.BAD_REQUEST, "玩家座位信息不完整");
    }

    if (a.id === b.id) {
      return;
    }

    const seatA = a.seatIndex;
    const seatB = b.seatIndex;
    if (seatA === seatB) {
      return;
    }

    a.seatIndex = seatB;
    b.seatIndex = seatA;

    this.bumpVersion();
  }

  admitWaitingPlayer(actorId: string, waitingPlayerId: string, seatIndex: number): void {
    this.ensureOwner(actorId);

    const phaseAllowsAdmit = this.phase === "ready" || this.phase === "ended";
    if (!phaseAllowsAdmit) {
      throw new GameError(ErrorCode.INVALID_PHASE, "仅准备/结算阶段可加入对局");
    }

    if (this.players.size >= MAX_PLAYERS) {
      throw new GameError(ErrorCode.ROOM_FULL, "房间人数已达上限");
    }

    const waiting = this.waitingPlayers.get(waitingPlayerId);
    if (!waiting) {
      throw new GameError(ErrorCode.BAD_REQUEST, "等待玩家不存在");
    }

    const normalizedSeat = this.normalizeSeatIndex(seatIndex);
    const occupied = [...this.players.values()].some((p) => p.seatIndex === normalizedSeat);
    if (occupied) {
      throw new GameError(ErrorCode.SEAT_CONFLICT, "座位已被占用");
    }

    this.waitingPlayers.delete(waitingPlayerId);
    this.addPlayer({
      id: waiting.id,
      nickname: waiting.nickname,
      avatar: waiting.avatar
    });

    const admitted = this.players.get(waiting.id);
    if (admitted) {
      admitted.seatIndex = normalizedSeat;
    }

    this.bumpVersion();
  }

  setTestSeed(actorId: string, seed: number): void {
    this.ensureOwner(actorId);
    if (!this.config.testMode) {
      throw new GameError(ErrorCode.FORBIDDEN, "未开启测试模式");
    }
    this.testSeed = Number(seed);
    this.rng = new SeededRng(this.testSeed);
    this.bumpVersion();
  }

  setNextDice(actorId: string, dice: number[], playerId?: string): void {
    this.ensureOwner(actorId);
    if (!this.config.testMode) {
      throw new GameError(ErrorCode.FORBIDDEN, "未开启测试模式");
    }
    const targetId = playerId || actorId;
    if (!this.players.has(targetId)) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "目标玩家不在对局中");
    }
    const normalized = this.normalizeDice(dice);
    this.nextDiceOverride.set(targetId, normalized);
    this.bumpVersion();
  }

  startGame(actorId: string): void {
    this.ensureOwner(actorId);

    if (this.getOnlinePlayers().length < MIN_PLAYERS_TO_START) {
      throw new GameError(ErrorCode.BAD_REQUEST, "至少2人才能开始");
    }

    if (this.phase !== "ready") {
      throw new GameError(ErrorCode.INVALID_PHASE, "当前阶段无法开始游戏");
    }

    const maxCount = this.getMaxCallCount();
    if (this.config.minOpeningCount > maxCount) {
      throw new GameError(ErrorCode.INVALID_CONFIG, "起叫最小数量超过当前总骰子数");
    }

    this.beginRound();
  }

  restartRound(actorId: string): void {
    if (this.phase !== "ended") {
      throw new GameError(ErrorCode.INVALID_PHASE, "仅结算后可再来一局");
    }

    if (!this.nextRoundStarterId) {
      throw new GameError(ErrorCode.BAD_REQUEST, "下一局起始位未确定");
    }

    if (actorId !== this.nextRoundStarterId) {
      const starter = this.players.get(this.nextRoundStarterId);
      const actor = this.players.get(actorId);
      const starterUnavailable = !starter || starter.onlineStatus === "offline" || starter.pendingRemoval;
      const actorIsOwner = Boolean(actor?.isOwner);
      if (!(starterUnavailable && actorIsOwner)) {
        throw new GameError(ErrorCode.FORBIDDEN, "仅上一局失败方可开始下一局");
      }
    }

    this.beginRound();
  }

  rollForPlayer(actorId: string): number[] {
    if (this.phase !== "rolling") {
      throw new GameError(ErrorCode.INVALID_PHASE, "当前不在可摇骰阶段");
    }

    const player = this.getPlayerOrThrow(actorId);

    if (player.rollLocked) {
      throw new GameError(ErrorCode.FORBIDDEN, "已确认骰面，不能再摇");
    }

    if (player.rollCountThisRound >= 5) {
      throw new GameError(ErrorCode.FORBIDDEN, "本局摇骰次数已达上限(5次)");
    }

    const dice = this.getDiceForPlayer(actorId);
    player.privateDice = dice;
    player.hasRolled = true;
    player.rollCountThisRound += 1;
    player.diceCupStatus = "open";

    this.bumpVersion();
    return dice;
  }

  lockDice(actorId: string): void {
    if (this.phase !== "rolling") {
      throw new GameError(ErrorCode.INVALID_PHASE, "当前不在可确认骰面阶段");
    }

    const player = this.getPlayerOrThrow(actorId);
    if (!player.hasRolled || player.privateDice.length !== this.config.dicePerPlayer) {
      throw new GameError(ErrorCode.BAD_REQUEST, "请先摇骰");
    }

    player.rollLocked = true;
    if (this.areAllPlayersRollLocked()) {
      this.enterCallingPhase();
    }
    this.bumpVersion();
  }

  finishRolling(actorId: string): { autoRolled: Array<{ playerId: string; dice: number[] }> } {
    this.ensureOwner(actorId);

    if (this.phase !== "rolling") {
      throw new GameError(ErrorCode.INVALID_PHASE, "当前不在可开始叫牌阶段");
    }

    const autoRolled: Array<{ playerId: string; dice: number[] }> = [];

    for (const player of this.players.values()) {
      if (!player.hasRolled || player.privateDice.length !== this.config.dicePerPlayer) {
        const dice = this.getDiceForPlayer(player.id);
        player.privateDice = dice;
        player.hasRolled = true;
        if (player.rollCountThisRound === 0) {
          player.rollCountThisRound = 1;
        }
        player.diceCupStatus = "open";
        autoRolled.push({ playerId: player.id, dice: [...dice] });
      }
      player.rollLocked = true;
    }

    this.enterCallingPhase();

    this.bumpVersion();
    return { autoRolled };
  }

  makeCall(actorId: string, count: number, point: number): DiceCall {
    if (this.phase !== "calling") {
      throw new GameError(ErrorCode.INVALID_PHASE, "当前不在叫牌阶段");
    }

    if (this.currentPlayerId !== actorId) {
      throw new GameError(ErrorCode.NOT_YOUR_TURN, "未轮到当前玩家叫牌");
    }

    if (!isValidCallInput(count, point)) {
      throw new GameError(ErrorCode.INVALID_CALL, "叫牌格式错误");
    }

    const maxCount = this.getMaxCallCount();
    if (this.lastCall && this.lastCall.count > maxCount) {
      throw new GameError(ErrorCode.INVALID_CALL, "叫牌记录异常");
    }

    if (!isCallHigher(this.lastCall, count, point)) {
      throw new GameError(ErrorCode.INVALID_CALL, "叫牌必须严格大于上一手");
    }

    if (count > maxCount) {
      throw new GameError(ErrorCode.INVALID_CALL, "数量超过总骰子数");
    }

    if (this.lastCall && this.lastCall.count === maxCount && this.lastCall.point === 6) {
      throw new GameError(ErrorCode.INVALID_CALL, "已到上限，下家只能开牌");
    }

    if (!this.lastCall && count < this.config.minOpeningCount) {
      throw new GameError(ErrorCode.INVALID_CALL, `起叫最小数量为 ${this.config.minOpeningCount}`);
    }

    const player = this.getPlayerOrThrow(actorId);

    if (!player.hasRolled || player.privateDice.length !== this.config.dicePerPlayer) {
      throw new GameError(ErrorCode.BAD_REQUEST, "请先摇骰");
    }

    if (!player.hasBidThisRound) {
      player.hasBidThisRound = true;
    }

    const call: DiceCall = {
      count,
      point: point as DiceCall["point"],
      by: actorId,
      ts: Date.now()
    };

    player.currentCall = call;
    this.lastCall = call;
    if (this.config.wildcardOneEnabled && call.point === 1) {
      this.wildcardOneLockedOff = true;
    }

    const nextPlayerId = this.getNextPlayerId(actorId, (p) => p.onlineStatus === "online");
    this.currentPlayerId = nextPlayerId;
    this.setCallingTurnStatus(nextPlayerId);

    this.bumpVersion();
    return call;
  }

  openDice(actorId: string, options: RuleOptions): OpenExecution {
    if (this.phase !== "calling") {
      throw new GameError(ErrorCode.INVALID_PHASE, "当前不在可开牌阶段");
    }

    if (!this.players.has(actorId)) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "玩家不在房间中");
    }

    if (!this.lastCall) {
      throw new GameError(ErrorCode.INVALID_CALL, "当前没有可开牌的上一手声明");
    }

    const targetId = this.lastCall.by;
    if (targetId === actorId) {
      throw new GameError(ErrorCode.INVALID_OPEN_TARGET, "上一手叫牌玩家不能自己开牌");
    }

    for (const player of this.players.values()) {
      if (!player.privateDice || player.privateDice.length !== this.config.dicePerPlayer) {
        player.privateDice = this.getDiceForPlayer(player.id);
        player.hasRolled = true;
      }
    }
    const orderedPlayers = this.getOrderedPlayers();
    const allDice = orderedPlayers.map((player) => player.privateDice);
    const playerIds = orderedPlayers.map((player) => player.id);

    const target = this.players.get(targetId);
    if (!target || !target.currentCall) {
      throw new GameError(ErrorCode.INVALID_OPEN_TARGET, "上一手叫牌玩家不存在或无有效声明");
    }

    const countBreakdown = getPointCountBreakdown(allDice, target.currentCall.point, options, playerIds);
    const actual = countBreakdown.total;
    const winnerId = actual >= target.currentCall.count ? target.id : actorId;

    const targets = [
      {
        targetId: target.id,
        declared: {
          count: target.currentCall.count,
          point: target.currentCall.point
        },
        actual,
        winnerId,
        countDetails: countBreakdown.players
      }
    ];

    const loserId = winnerId === target.id ? actorId : target.id;
    this.nextRoundStarterId = loserId;

    this.phase = "opening";

    for (const player of this.players.values()) {
      player.diceCupStatus = "open";
      player.turnStatus = "done";
    }

    this.phase = "ended";
    this.currentPlayerId = loserId;

    const openResult: OpenResultDTO = {
      round: this.round,
      openerId: actorId,
      targets,
      serverTs: Date.now()
    };

    const roundSummary: RoundSummaryDTO = {
      round: this.round,
      roomId: this.roomId,
      players: this.getOrderedPlayers().map((player) => ({
        playerId: player.id,
        accountId: player.accountId,
        accountDisplayId: player.accountDisplayId,
        nickname: player.nickname,
        dice: [...player.privateDice],
        call: player.currentCall
      })),
      openResult,
      serverTs: Date.now()
    };

    this.bumpVersion();

    return {
      openResult,
      roundSummary
    };
  }

  getPlayerPrivateDice(playerId: string): number[] {
    const player = this.getPlayerOrThrow(playerId);
    return [...player.privateDice];
  }

  getAutoCallSuggestion(): { count: number; point: DiceCall["point"] } | null {
    if (this.phase !== "calling" || !this.currentPlayerId) {
      return null;
    }

    const maxCount = this.getMaxCallCount();
    if (this.lastCall && this.lastCall.count > maxCount) {
      return null;
    }
    if (this.lastCall && this.lastCall.count === maxCount && this.lastCall.point === 6) {
      return null;
    }

    if (!this.lastCall) {
      if (this.config.minOpeningCount > maxCount) {
        return null;
      }
      return {
        count: this.config.minOpeningCount,
        point: 2
      };
    }

    const nextPoint = this.lastCall.point < 6 ? (this.lastCall.point + 1) : 2;
    const nextCount = this.lastCall.point < 6 ? this.lastCall.count : this.lastCall.count + 1;

    if (nextCount > maxCount) {
      return null;
    }

    return {
      count: nextCount,
      point: nextPoint as DiceCall["point"]
    };
  }

  getRuleOptionsForCurrentRound(): RuleOptions {
    return {
      oneAsWildcard: this.config.wildcardOneEnabled && !this.wildcardOneLockedOff
    };
  }

  private beginRound(): void {
    this.configLocked = true;
    this.lastCall = undefined;
    this.wildcardOneLockedOff = false;

    // Clear players who left during the last round after settlement.
    for (const player of [...this.players.values()]) {
      if (player.pendingRemoval) {
        this.players.delete(player.id);
      }
    }
    if (this.players.size === 0) {
      this.phase = "ready";
      this.currentPlayerId = undefined;
      this.lastCall = undefined;
      this.bumpVersion();
      return;
    }
    this.ensureRoomHasOwner();

    if (this.getOnlinePlayers().length < MIN_PLAYERS_TO_START) {
      this.phase = "ready";
      this.nextRoundStarterId = undefined;
      this.resetRoundState();
      this.bumpVersion();
      return;
    }

    this.phase = "rolling";
    this.round += 1;

    for (const player of this.players.values()) {
      player.privateDice = [];
      player.hasRolled = false;
      player.hasBidThisRound = false;
      player.rollCountThisRound = 0;
      player.currentCall = undefined;
      player.diceCupStatus = "closed";
      player.turnStatus = "idle";
      player.rollLocked = false;
      player.pendingRemoval = false;
    }

    const starter = this.nextRoundStarterId && this.players.get(this.nextRoundStarterId)?.onlineStatus === "online"
      ? this.nextRoundStarterId
      : undefined;
    this.nextRoundStarterId = undefined;

    const firstPlayerId = starter || this.getFirstPlayerId((p) => p.onlineStatus === "online");
    this.currentPlayerId = firstPlayerId;
    this.bumpVersion();
  }

  private areAllPlayersRollLocked(): boolean {
    if (this.players.size === 0) {
      return false;
    }

    for (const player of this.players.values()) {
      if (!player.rollLocked) {
        return false;
      }
    }
    return true;
  }

  private enterCallingPhase(): void {
    this.phase = "calling";

    const preferredStarter = this.currentPlayerId;
    const starterOnline = preferredStarter && this.players.get(preferredStarter)?.onlineStatus === "online"
      ? preferredStarter
      : undefined;
    const firstPlayerId = starterOnline || this.getFirstPlayerId((p) => p.onlineStatus === "online");
    this.currentPlayerId = firstPlayerId;
    this.setCallingTurnStatus(firstPlayerId);
  }

  private resetRoundState(): void {
    this.lastCall = undefined;
    this.currentPlayerId = undefined;

    for (const player of this.players.values()) {
      player.privateDice = [];
      player.hasRolled = false;
      player.hasBidThisRound = false;
      player.rollCountThisRound = 0;
      player.currentCall = undefined;
      player.diceCupStatus = "closed";
      player.turnStatus = "idle";
      player.rollLocked = false;
      player.pendingRemoval = false;
    }

    const fallbackActive = this.getFirstPlayerId((p) => p.onlineStatus === "online");
    if (fallbackActive) {
      this.currentPlayerId = fallbackActive;
      this.getPlayerOrThrow(fallbackActive).turnStatus = "active";
    }
  }

  private abortActiveRoundToReady(): void {
    for (const player of [...this.players.values()]) {
      if (player.pendingRemoval) {
        this.players.delete(player.id);
      }
    }

    this.ensureRoomHasOwner();
    this.phase = "ready";
    this.nextRoundStarterId = undefined;
    this.resetRoundState();
  }

  private repairTurnAfterPlayerChange(): void {
    if (!this.currentPlayerId) {
      if (this.phase === "calling") {
        const next = this.getFirstPlayerId((p) => p.onlineStatus === "online");
        this.currentPlayerId = next;
        this.setCallingTurnStatus(next);
      } else if (this.phase === "ended") {
        const starter = this.nextRoundStarterId && this.players.get(this.nextRoundStarterId)?.onlineStatus === "online"
          ? this.nextRoundStarterId
          : undefined;
        const next = starter || this.getFirstPlayerId((p) => p.onlineStatus === "online");
        this.currentPlayerId = next;
        if (next) {
          this.getPlayerOrThrow(next).turnStatus = "active";
        }
      } else if (this.phase === "rolling") {
        const next = this.getFirstPlayerId((p) => p.onlineStatus === "online");
        this.currentPlayerId = next;
      } else if (this.phase === "ready") {
        const next = this.getFirstPlayerId((p) => p.onlineStatus === "online");
        this.currentPlayerId = next;
        if (next) {
          this.getPlayerOrThrow(next).turnStatus = "active";
        }
      }
    }
  }

  private getPlayerOrThrow(playerId: string): InternalPlayer {
    const player = this.players.get(playerId);
    if (!player) {
      throw new GameError(ErrorCode.PLAYER_NOT_IN_ROOM, "玩家不在房间中");
    }
    return player;
  }

  private ensureOwner(actorId: string): void {
    const actor = this.getPlayerOrThrow(actorId);
    if (!actor.isOwner) {
      throw new GameError(ErrorCode.FORBIDDEN, "仅房主可操作");
    }
  }

  private ensureRoomHasOwner(): void {
    if ([...this.players.values()].some((player) => player.isOwner && !player.pendingRemoval)) {
      return;
    }

    const nextOwner = this.getOrderedPlayers().find((player) => !player.pendingRemoval)
      || this.getOrderedPlayers()[0];
    if (nextOwner) {
      nextOwner.isOwner = true;
    }
  }

  private allocateSeatIndex(): number {
    const used = new Set([...this.players.values()].map((player) => player.seatIndex));

    for (let index = 1; index <= MAX_PLAYERS; index += 1) {
      if (!used.has(index)) {
        return index;
      }
    }

    throw new GameError(ErrorCode.ROOM_FULL, "房间人数已达上限");
  }

  private getOrderedPlayers(): InternalPlayer[] {
    return [...this.players.values()].sort((a, b) => a.seatIndex - b.seatIndex);
  }

  private getOnlinePlayers(): InternalPlayer[] {
    return this.getOrderedPlayers().filter((player) => player.onlineStatus === "online");
  }

  private getFirstPlayerId(predicate: (player: InternalPlayer) => boolean): string | undefined {
    return this.getOrderedPlayers().find(predicate)?.id;
  }

  private getNextPlayerId(
    currentId: string,
    predicate: (player: InternalPlayer) => boolean
  ): string | undefined {
    const orderedAsc = this.getOrderedPlayers();
    const ordered = this.config.direction === "ccw" ? [...orderedAsc].reverse() : orderedAsc;
    if (ordered.length === 0) {
      return undefined;
    }

    const startIndex = ordered.findIndex((player) => player.id === currentId);
    if (startIndex === -1) {
      return ordered.find(predicate)?.id;
    }

    for (let step = 1; step <= ordered.length; step += 1) {
      const candidate = ordered[(startIndex + step) % ordered.length];
      if (predicate(candidate)) {
        return candidate.id;
      }
    }

    return undefined;
  }

  private setCallingTurnStatus(activePlayerId: string | undefined): void {
    for (const player of this.players.values()) {
      player.turnStatus = "idle";
    }

    if (activePlayerId) {
      const activePlayer = this.players.get(activePlayerId);
      if (activePlayer) {
        activePlayer.turnStatus = "active";
      }
    }
  }

  private bumpVersion(): void {
    this.version += 1;
  }

  private getDiceForPlayer(playerId: string): number[] {
    const overridden = this.nextDiceOverride.get(playerId);
    if (overridden) {
      this.nextDiceOverride.delete(playerId);
      return [...overridden];
    }

    if (this.config.testMode) {
      if (!this.rng && typeof this.testSeed === "number") {
        this.rng = new SeededRng(this.testSeed);
      }

      if (this.rng) {
        return Array.from({ length: this.config.dicePerPlayer }, () => this.rng!.nextInt(1, 7));
      }
    }

    return rollDice(this.config.dicePerPlayer);
  }

  private normalizeSeatIndex(seatIndex: number): number {
    const seat = Number(seatIndex);
    if (!Number.isInteger(seat) || seat < 1 || seat > MAX_PLAYERS) {
      throw new GameError(ErrorCode.BAD_REQUEST, "座位号不合法");
    }
    return seat;
  }

  private normalizeDice(dice: number[]): number[] {
    if (!Array.isArray(dice) || dice.length !== this.config.dicePerPlayer) {
      throw new GameError(ErrorCode.BAD_REQUEST, `骰子数量必须为${this.config.dicePerPlayer}`);
    }
    const normalized = dice.map((d) => Number(d));
    for (const d of normalized) {
      if (!Number.isInteger(d) || d < 1 || d > 6) {
        throw new GameError(ErrorCode.BAD_REQUEST, "骰子点数不合法");
      }
    }
    return normalized;
  }

  private normalizeConfig(input: RoomConfigDTO): RoomConfigDTO {
    const direction = input.direction as RoomDirection;
    if (direction !== "cw" && direction !== "ccw") {
      throw new GameError(ErrorCode.INVALID_CONFIG, "direction 必须为 cw 或 ccw");
    }

    const dicePerPlayer = input.dicePerPlayer == null
      ? DEFAULT_DICE_PER_PLAYER
      : Number(input.dicePerPlayer);
    if (!Number.isInteger(dicePerPlayer) || dicePerPlayer < 1 || dicePerPlayer > 10) {
      throw new GameError(ErrorCode.INVALID_CONFIG, "dicePerPlayer 必须为 1-10 的整数");
    }

    const minOpeningCount = input.minOpeningCount == null
      ? 1
      : Number(input.minOpeningCount);
    if (!Number.isInteger(minOpeningCount) || minOpeningCount < 1) {
      throw new GameError(ErrorCode.INVALID_CONFIG, "minOpeningCount 必须为 >=1 的整数");
    }
    const maxAllowed = MAX_PLAYERS * dicePerPlayer;
    if (minOpeningCount > maxAllowed) {
      throw new GameError(ErrorCode.INVALID_CONFIG, `minOpeningCount 不能超过 ${maxAllowed}`);
    }

    return {
      direction,
      wildcardOneEnabled: Boolean(input.wildcardOneEnabled),
      openMode: input.openMode === "multi" ? "multi" : "single",
      dicePerPlayer,
      minOpeningCount,
      testMode: Boolean(input.testMode),
      themeId: normalizeRoomThemeId(input.themeId)
    };
  }

  private getMaxCallCount(): number {
    return this.players.size * this.config.dicePerPlayer;
  }
}
