export type OnlineStatus = "online" | "offline";
export type TurnStatus = "idle" | "active" | "done";
export type DiceCupStatus = "closed" | "open";
export type RoomPhase = "ready" | "rolling" | "calling" | "opening" | "ended";
export type NetworkHealth = "good" | "lag" | "disconnected";
export type RoomDirection = "cw" | "ccw";
export type OpenMode = "single" | "multi";
export type AccountProvider = "wechat";
export type RoomThemeId = "jade-green" | "ruby-red" | "imperial-red";

export interface RoomConfigDTO {
  direction: RoomDirection;
  wildcardOneEnabled: boolean;
  openMode: OpenMode;
  dicePerPlayer: number;
  minOpeningCount: number;
  testMode: boolean;
  themeId?: RoomThemeId;
}

export interface DiceCall {
  count: number;
  point: 1 | 2 | 3 | 4 | 5 | 6;
  by: string;
  ts: number;
}

export interface PlayerState {
  id: string;
  accountId?: string;
  accountDisplayId?: string;
  nickname: string;
  avatar: string;
  isOwner: boolean;
  onlineStatus: OnlineStatus;
  turnStatus: TurnStatus;
  seatIndex: number;
  diceCupStatus: DiceCupStatus;
  rollLocked: boolean;
  rollCountThisRound: number;
  currentCall?: DiceCall;
}

export interface WaitingPlayerState {
  id: string;
  accountId?: string;
  accountDisplayId?: string;
  nickname: string;
  avatar: string;
  onlineStatus: OnlineStatus;
}

export interface RoomStateDTO {
  roomId: string;
  phase: RoomPhase;
  round: number;
  currentPlayerId?: string;
  config: RoomConfigDTO;
  players: PlayerState[];
  waitingPlayers: WaitingPlayerState[];
  lastCall?: DiceCall;
  turnDeadlineTs?: number;
  networkHealth: NetworkHealth;
  version: number;
  serverTs: number;
}

export interface OpenResultTarget {
  targetId: string;
  declared: {
    count: number;
    point: 1 | 2 | 3 | 4 | 5 | 6;
  };
  actual: number;
  winnerId: string;
  countDetails?: OpenResultCountPlayer[];
}

export interface OpenResultCountDie {
  index: number;
  value: number;
  counted: boolean;
  wildcard: boolean;
}

export interface OpenResultCountPlayer {
  playerId: string;
  dice: OpenResultCountDie[];
  contribution: number;
  straight: boolean;
  leopardBonus: boolean;
}

export interface OpenResultDTO {
  round: number;
  openerId: string;
  targets: OpenResultTarget[];
  serverTs: number;
}

export interface RoundSummaryPlayer {
  playerId: string;
  accountId?: string;
  accountDisplayId?: string;
  nickname: string;
  dice: number[];
  call?: DiceCall;
}

export interface RoundSummaryDTO {
  round: number;
  roomId: string;
  players: RoundSummaryPlayer[];
  openResult: OpenResultDTO;
  serverTs: number;
}

export interface HistoryListDTO {
  roomId: string;
  items: RoundSummaryDTO[];
  nextBeforeRound?: number;
  serverTs: number;
}

export interface VoiceUploadedDTO {
  roomId: string;
  playerId: string;
  durationMs: number;
  fileId: string;
  mimeType: string;
  createdAt: number;
  serverTs: number;
}

export interface VoiceListItemDTO {
  fileId: string;
  playerId: string;
  durationMs: number;
  mimeType: string;
  createdAt: number;
}

export interface VoiceListDTO {
  roomId: string;
  items: VoiceListItemDTO[];
  serverTs: number;
}

export interface VoiceFetchedDTO {
  roomId: string;
  fileId: string;
  playerId: string;
  durationMs: number;
  mimeType: string;
  base64: string;
  serverTs: number;
}

export interface ChatMessageDTO {
  id: string;
  playerId: string;
  text: string;
  createdAt: number;
}

export interface ChatListDTO {
  roomId: string;
  items: ChatMessageDTO[];
  serverTs: number;
}

export interface RecentRoomDTO {
  roomId: string;
  role: "owner" | "guest";
  lastSeenAt: number;
}

export interface AccountStatsDTO {
  totalRounds: number;
  roundsWon: number;
  roundsLost: number;
  totalCallsMade: number;
  totalOpenRequests: number;
  roomsCreated: number;
  roomsJoined: number;
  lastRoundAt?: number;
}

export interface AccountProfileDTO {
  accountId: string;
  displayId: string;
  provider: AccountProvider;
  nickname: string;
  nicknameCustomized: boolean;
  avatarUrl: string;
  createdAt: number;
  lastLoginAt: number;
  stats: AccountStatsDTO;
  recentRooms: RecentRoomDTO[];
}

export interface AccountLoginResultDTO {
  profile: AccountProfileDTO;
  sessionToken: string;
  loginAt: number;
  authMode: "wechat" | "mock";
}

export interface ClientEventMap {
  "room:create": {
    nickname: string;
    avatar: string;
    config: RoomConfigDTO;
    accountId?: string;
    accountSessionToken?: string;
  };
  "room:join": {
    roomId: string;
    nickname: string;
    avatar: string;
    accountId?: string;
    accountSessionToken?: string;
  };
  "room:rejoin": { roomId: string; playerId: string; resumeToken: string };
  "room:config:update": Partial<Pick<RoomConfigDTO, "direction" | "wildcardOneEnabled" | "dicePerPlayer" | "minOpeningCount">>;
  "room:seat:set": { playerId: string; seatIndex: number };
  "room:seat:swap": { playerIdA: string; playerIdB: string };
  "room:waiting:admit": { playerId: string; seatIndex: number };
  "history:list": { limit?: number; beforeRound?: number };
  "room:leave": Record<string, never>;
  "player:update": { nickname?: string; avatar?: string; accountId?: string; accountSessionToken?: string };
  "game:start": Record<string, never>;
  "dice:roll": Record<string, never>;
  "dice:lock": Record<string, never>;
  "rolling:finish": Record<string, never>;
  "call:make": { count: number; point: 1 | 2 | 3 | 4 | 5 | 6 };
  "open:request": { targetPlayerIds?: string[] };
  "round:restart": Record<string, never>;
  "chat:send": { text: string };
  "chat:list": { limit?: number };
  "voice:transcript": { text: string; ts: number };
  "voice:upload": {
    fileName: string;
    mimeType: string;
    durationMs: number;
    base64: string;
  };
  "voice:list": {
    limit?: number;
  };
  "voice:fetch": {
    fileId: string;
  };
  "system:heartbeat": {
    ts: number;
  };
  "test:setSeed": { seed: number };
  "test:setNextDice": { playerId?: string; dice: number[] };
}

export interface ServerEventMap {
  "room:state": RoomStateDTO;
  "action:ack": {
    actionId?: string;
    ok: boolean;
    code?: string;
    reason?: string;
    roomId?: string;
    playerId?: string;
    resumeToken?: string;
    themeId?: RoomThemeId;
  };
  "dice:privateResult": {
    round: number;
    playerId: string;
    dice: number[];
    serverTs: number;
  };
  "open:result": OpenResultDTO;
  "round:summary": RoundSummaryDTO;
  "history:list": HistoryListDTO;
  "voice:uploaded": VoiceUploadedDTO;
  "voice:list": VoiceListDTO;
  "voice:fetched": VoiceFetchedDTO;
  "chat:new": {
    roomId: string;
    message: ChatMessageDTO;
    serverTs: number;
  };
  "chat:list": ChatListDTO;
  "system:error": {
    code: string;
    message: string;
    serverTs: number;
  };
}

export type ClientEventName = keyof ClientEventMap;
export type ServerEventName = keyof ServerEventMap;

export interface ClientMessage<E extends ClientEventName = ClientEventName> {
  event: E;
  payload: ClientEventMap[E];
  actionId?: string;
}

export interface ServerMessage<E extends ServerEventName = ServerEventName> {
  event: E;
  payload: ServerEventMap[E];
}

export interface RuleOptions {
  oneAsWildcard: boolean;
}
