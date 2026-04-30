const DEFAULT_ROOM_THEME_ID = "jade-green";

const ROOM_THEME_IDS = [
  DEFAULT_ROOM_THEME_ID,
  "ruby-red",
  "imperial-red",
  "glacier-blue"
];

const ROOM_THEME_LABELS = {
  "jade-green": "青岚",
  "glacier-blue": "霁雪",
  "imperial-red": "绛华",
  "ruby-red": "玄曜"
};

const ROOM_THEME_ALIASES = {
  green: "jade-green",
  "jade-green": "jade-green",
  "青岚": "jade-green",
  black: "ruby-red",
  "黑": "ruby-red",
  "ruby-red": "ruby-red",
  "玄曜": "ruby-red",
  red: "imperial-red",
  "红": "imperial-red",
  "imperial-red": "imperial-red",
  "绛华": "imperial-red",
  white: "glacier-blue",
  "白": "glacier-blue",
  blue: "glacier-blue",
  "glacier-blue": "glacier-blue",
  "霁雪": "glacier-blue"
};

function parseRoomThemeId(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }
  return ROOM_THEME_ALIASES[value] || ROOM_THEME_ALIASES[value.toLowerCase()] || "";
}

function normalizeRoomThemeId(raw) {
  return parseRoomThemeId(raw) || DEFAULT_ROOM_THEME_ID;
}

function pickRandomRoomThemeId() {
  const index = Math.floor(Math.random() * ROOM_THEME_IDS.length);
  return ROOM_THEME_IDS[index] || DEFAULT_ROOM_THEME_ID;
}

function buildRoomThemeClass(themeId) {
  return `room-theme-${normalizeRoomThemeId(themeId)}`;
}

function getRoomThemeLabel(themeId) {
  const normalized = normalizeRoomThemeId(themeId);
  return ROOM_THEME_LABELS[normalized] || ROOM_THEME_LABELS[DEFAULT_ROOM_THEME_ID];
}

module.exports = {
  DEFAULT_ROOM_THEME_ID,
  ROOM_THEME_IDS,
  ROOM_THEME_LABELS,
  ROOM_THEME_ALIASES,
  parseRoomThemeId,
  normalizeRoomThemeId,
  pickRandomRoomThemeId,
  buildRoomThemeClass,
  getRoomThemeLabel
};
