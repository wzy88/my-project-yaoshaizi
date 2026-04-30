const DICE_FACE_ASSETS = {
  1: "/assets/figma-room-v2/die-face-figma-1.svg",
  2: "/assets/figma-room-v2/die-face-figma-2.svg",
  3: "/assets/figma-room-v2/die-face-figma-3.svg",
  4: "/assets/figma-room-v2/die-face-figma-4.svg",
  5: "/assets/figma-room-v2/die-face-figma-5.svg",
  6: "/assets/figma-room-v2/die-face-figma-6.svg"
};

const SELF_DICE_THEME_ASSETS = {
  "jade-green": {
    1: "/pages/room/assets/room-themes/jade-green-die-face-1.svg",
    2: "/pages/room/assets/room-themes/jade-green-die-face-2.svg",
    3: "/pages/room/assets/room-themes/jade-green-die-face-3.svg",
    4: "/pages/room/assets/room-themes/jade-green-die-face-4.svg",
    5: "/pages/room/assets/room-themes/jade-green-die-face-5.svg",
    6: "/pages/room/assets/room-themes/jade-green-die-face-6.svg"
  },
  "ruby-red": {
    1: "/pages/room/assets/room-themes/ruby-red-die-face-1.svg",
    2: "/pages/room/assets/room-themes/ruby-red-die-face-2.svg",
    3: "/pages/room/assets/room-themes/ruby-red-die-face-3.svg",
    4: "/pages/room/assets/room-themes/ruby-red-die-face-4.svg",
    5: "/pages/room/assets/room-themes/ruby-red-die-face-5.svg",
    6: "/pages/room/assets/room-themes/ruby-red-die-face-6.svg"
  },
  "imperial-red": {
    1: "/pages/room/assets/room-themes/imperial-red-die-face-1.svg",
    2: "/pages/room/assets/room-themes/imperial-red-die-face-2.svg",
    3: "/pages/room/assets/room-themes/imperial-red-die-face-3.svg",
    4: "/pages/room/assets/room-themes/imperial-red-die-face-4.svg",
    5: "/pages/room/assets/room-themes/imperial-red-die-face-5.svg",
    6: "/pages/room/assets/room-themes/imperial-red-die-face-6.svg"
  },
  "glacier-blue": {
    1: "/pages/room/assets/room-themes/glacier-blue-die-face-1.svg",
    2: "/pages/room/assets/room-themes/glacier-blue-die-face-2.svg",
    3: "/pages/room/assets/room-themes/glacier-blue-die-face-3.svg",
    4: "/pages/room/assets/room-themes/glacier-blue-die-face-4.svg",
    5: "/pages/room/assets/room-themes/glacier-blue-die-face-5.svg",
    6: "/pages/room/assets/room-themes/glacier-blue-die-face-6.svg"
  }
};
const runtimeSelfDiceThemeAssets = {};

const DEFAULT_3D_DIE_ASSET = DICE_FACE_ASSETS[3];
const SELF_DICE_PLACEHOLDER = [2, 4, 5, 2, 6];

function getDieAsset(point) {
  const key = Number(point);
  return DICE_FACE_ASSETS[key] || "";
}

function getSelfDieAsset(point, themeId = "") {
  const key = Number(point);
  const normalizedThemeId = String(themeId || "").trim();
  const themeAssets = runtimeSelfDiceThemeAssets[normalizedThemeId] || SELF_DICE_THEME_ASSETS[normalizedThemeId];
  if (themeAssets && themeAssets[key]) {
    return themeAssets[key];
  }
  return getDieAsset(point);
}

function getRoomDieAsset(point, themeId = "") {
  return getSelfDieAsset(point, themeId);
}

function mapDicePointsToAssets(points) {
  return (Array.isArray(points) ? points : []).map((point) => getDieAsset(point));
}

function registerRuntimeDiceThemeAssets(themeId, diceAssets) {
  const id = String(themeId || "").trim();
  const source = diceAssets && typeof diceAssets === "object" ? diceAssets : {};
  if (!id) {
    return {};
  }

  const normalized = {};
  for (let point = 1; point <= 6; point += 1) {
    const src = String(source[point] || source[String(point)] || "").trim();
    if (src) {
      normalized[point] = src;
    }
  }

  if (Object.keys(normalized).length > 0) {
    runtimeSelfDiceThemeAssets[id] = {
      ...(SELF_DICE_THEME_ASSETS[id] || {}),
      ...normalized
    };
  }

  return runtimeSelfDiceThemeAssets[id] || SELF_DICE_THEME_ASSETS[id] || {};
}

const HOME_HERO_DICE_ASSETS = mapDicePointsToAssets([5, 2, 1]);
const LOBBY_FLOAT_DICE_ASSETS = mapDicePointsToAssets([5, 2]);
const LOBBY_CREATE_DIE_ASSET = getDieAsset(5);

module.exports = {
  DICE_FACE_ASSETS,
  DEFAULT_3D_DIE_ASSET,
  SELF_DICE_PLACEHOLDER,
  HOME_HERO_DICE_ASSETS,
  LOBBY_FLOAT_DICE_ASSETS,
  LOBBY_CREATE_DIE_ASSET,
  registerRuntimeDiceThemeAssets,
  getDieAsset,
  getSelfDieAsset,
  getRoomDieAsset
};
