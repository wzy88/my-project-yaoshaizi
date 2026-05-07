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
export const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS || 120000);
export const MAX_VOICE_BASE64_SIZE = Number(process.env.MAX_VOICE_BASE64_SIZE || 3_000_000);
export const WECHAT_APP_ID = String(process.env.WECHAT_APP_ID || "").trim();
export const WECHAT_APP_SECRET = String(process.env.WECHAT_APP_SECRET || "").trim();
export const WECHAT_CODE2SESSION_URL = String(
  process.env.WECHAT_CODE2SESSION_URL || "https://api.weixin.qq.com/sns/jscode2session"
).trim();
export const WECHAT_AUTH_MOCK = process.env.WECHAT_AUTH_MOCK === "1";
export const ALLOW_SAME_ACCOUNT_MULTI_JOIN = process.env.ALLOW_SAME_ACCOUNT_MULTI_JOIN === "1";
export const TENCENT_ASR_SECRET_ID = String(
  process.env.TENCENT_ASR_SECRET_ID || process.env.TENCENTCLOUD_SECRET_ID || ""
).trim();
export const TENCENT_ASR_SECRET_KEY = String(
  process.env.TENCENT_ASR_SECRET_KEY || process.env.TENCENTCLOUD_SECRET_KEY || ""
).trim();
export const TENCENT_ASR_REGION = String(process.env.TENCENT_ASR_REGION || "ap-shanghai").trim() || "ap-shanghai";
export const TENCENT_ASR_ENGINE_MODEL_TYPE = String(
  process.env.TENCENT_ASR_ENGINE_MODEL_TYPE || "16k_zh"
).trim() || "16k_zh";

export const ROLL_TIMEOUT_MS = Number(process.env.ROLL_TIMEOUT_MS || 15000);
// 叫牌倒计时是产品规则，不允许云托管环境变量把线上改回 18 秒。
export const CALL_TIMEOUT_MS = 30000;
