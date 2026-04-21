const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 12;

const BLOCKED_TERMS = [
  "客服",
  "代练",
  "代打",
  "陪玩",
  "接单",
  "广告",
  "推广",
  "引流",
  "兼职",
  "赌博",
  "博彩",
  "赌场",
  "下注",
  "押注",
  "百家乐",
  "德州",
  "棋牌",
  "微信",
  "wechat",
  "qq",
  "q群",
  "群号",
  "电话",
  "手机",
  "邮箱"
];

const BLOCKED_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /1\d{10}/,
  /[qQ]{2}\d{5,}/
];

function normalizeNicknameInput(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function validateNickname(raw) {
  const value = normalizeNicknameInput(raw);

  if (!value) {
    return {
      ok: false,
      value,
      message: "昵称不能为空"
    };
  }

  const length = Array.from(value).length;
  if (length < NICKNAME_MIN_LENGTH || length > NICKNAME_MAX_LENGTH) {
    return {
      ok: false,
      value,
      message: `昵称需为${NICKNAME_MIN_LENGTH}-${NICKNAME_MAX_LENGTH}个字`
    };
  }

  const lower = value.toLowerCase();
  const hasBlockedTerm = BLOCKED_TERMS.some((term) => lower.includes(String(term).toLowerCase()));
  const hasBlockedPattern = BLOCKED_PATTERNS.some((pattern) => pattern.test(value));
  if (hasBlockedTerm || hasBlockedPattern) {
    return {
      ok: false,
      value,
      message: "昵称包含不合适的内容，请换一个"
    };
  }

  return {
    ok: true,
    value,
    message: ""
  };
}

module.exports = {
  NICKNAME_MIN_LENGTH,
  NICKNAME_MAX_LENGTH,
  normalizeNicknameInput,
  validateNickname
};
