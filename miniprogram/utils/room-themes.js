const DEFAULT_ROOM_THEME_ID = "jade-green";

const ROOM_THEME_IDS = [
  DEFAULT_ROOM_THEME_ID,
  "ruby-red",
  "imperial-red"
];

const ROOM_THEME_LABELS = {
  "jade-green": "绿色",
  "imperial-red": "红金",
  "ruby-red": "黑色"
};

function normalizeRoomThemeId(raw) {
  const value = String(raw || "").trim();
  return ROOM_THEME_IDS.includes(value) ? value : DEFAULT_ROOM_THEME_ID;
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
  normalizeRoomThemeId,
  pickRandomRoomThemeId,
  buildRoomThemeClass,
  getRoomThemeLabel
};
