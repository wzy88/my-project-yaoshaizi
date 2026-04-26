const DEFAULT_ROOM_THEME_ID = "jade-green";

const ROOM_THEME_IDS = [
  DEFAULT_ROOM_THEME_ID,
  "ruby-red",
  "sapphire-blue",
  "imperial-red",
  "mist-ivory"
];

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

module.exports = {
  DEFAULT_ROOM_THEME_ID,
  ROOM_THEME_IDS,
  normalizeRoomThemeId,
  pickRandomRoomThemeId,
  buildRoomThemeClass
};
