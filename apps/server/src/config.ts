import type { RuleOptions } from "@dice/shared";

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;
export const DEFAULT_DICE_PER_PLAYER = 5;

export const DEFAULT_RULE_OPTIONS: RuleOptions = {
  oneAsWildcard: true
};

export const SERVER_PORT = Number(process.env.PORT || 3000);
export const SERVER_HOST = process.env.HOST || "0.0.0.0";
export const PORT_RETRY_LIMIT = Number(process.env.PORT_RETRY_LIMIT || 10);
export const WS_PATH = process.env.WS_PATH || "/ws";
export const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS || 30000);
export const MAX_VOICE_BASE64_SIZE = Number(process.env.MAX_VOICE_BASE64_SIZE || 3_000_000);

export const ROLL_TIMEOUT_MS = Number(process.env.ROLL_TIMEOUT_MS || 15000);
export const CALL_TIMEOUT_MS = Number(process.env.CALL_TIMEOUT_MS || 18000);
