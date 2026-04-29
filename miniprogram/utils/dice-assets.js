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
    1: "/assets/figma-room-v2/die-face-figma-1.svg",
    2: "/assets/figma-room-v2/die-face-figma-2.svg",
    3: "/assets/figma-room-v2/die-face-figma-3.svg",
    4: "/assets/figma-room-v2/die-face-figma-4.svg",
    5: "/assets/figma-room-v2/die-face-figma-5.svg",
    6: "/assets/figma-room-v2/die-face-figma-6.svg"
  },
  "ruby-red": {
    1: "/assets/room-themes/ruby-red-die-face-1.svg",
    2: "/assets/room-themes/ruby-red-die-face-2.svg",
    3: "/assets/room-themes/ruby-red-die-face-3.svg",
    4: "/assets/room-themes/ruby-red-die-face-4.svg",
    5: "/assets/room-themes/ruby-red-die-face-5.svg",
    6: "/assets/room-themes/ruby-red-die-face-6.svg"
  },
  "imperial-red": {
    1: "/assets/room-themes/imperial-red-die-face-1.svg",
    2: "/assets/room-themes/imperial-red-die-face-2.svg",
    3: "/assets/room-themes/imperial-red-die-face-3.svg",
    4: "/assets/room-themes/imperial-red-die-face-4.svg",
    5: "/assets/room-themes/imperial-red-die-face-5.svg",
    6: "/assets/room-themes/imperial-red-die-face-6.svg"
  }
};

const DEFAULT_3D_DIE_ASSET = DICE_FACE_ASSETS[3];
const SELF_DICE_PLACEHOLDER = [2, 4, 5, 2, 6];

function getDieAsset(point) {
  const key = Number(point);
  return DICE_FACE_ASSETS[key] || "";
}

function getSelfDieAsset(point, themeId = "") {
  const key = Number(point);
  const themeAssets = SELF_DICE_THEME_ASSETS[String(themeId || "").trim()];
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
  getDieAsset,
  getSelfDieAsset,
  getRoomDieAsset
};
