const DICE_FACE_ASSETS = {
  1: "/assets/figma-room-v2/die-face-figma-1.svg",
  2: "/assets/figma-room-v2/die-face-figma-2.svg",
  3: "/assets/figma-room-v2/die-face-figma-3.svg",
  4: "/assets/figma-room-v2/die-face-figma-4.svg",
  5: "/assets/figma-room-v2/die-face-figma-5.svg",
  6: "/assets/figma-room-v2/die-face-figma-6.svg"
};

const THEMED_SELF_DICE_FACE_ASSETS = {
  "ruby-red": {
    1: "/assets/figma-room-v2/die-face-ruby-1.svg",
    2: "/assets/figma-room-v2/die-face-ruby-2.svg",
    3: "/assets/figma-room-v2/die-face-ruby-3.svg",
    4: "/assets/figma-room-v2/die-face-ruby-4.svg",
    5: "/assets/figma-room-v2/die-face-ruby-5.svg",
    6: "/assets/figma-room-v2/die-face-ruby-6.svg"
  },
  "sapphire-blue": {
    1: "/assets/figma-room-v2/die-face-sapphire-1.svg",
    2: "/assets/figma-room-v2/die-face-sapphire-2.svg",
    3: "/assets/figma-room-v2/die-face-sapphire-3.svg",
    4: "/assets/figma-room-v2/die-face-sapphire-4.svg",
    5: "/assets/figma-room-v2/die-face-sapphire-5.svg",
    6: "/assets/figma-room-v2/die-face-sapphire-6.svg"
  }
};

const DEFAULT_3D_DIE_ASSET = DICE_FACE_ASSETS[3];
const SELF_DICE_PLACEHOLDER = [2, 4, 5, 2, 6];

function getDieAsset(point) {
  const key = Number(point);
  return DICE_FACE_ASSETS[key] || "";
}

function getSelfDieAsset(point, themeId) {
  const key = Number(point);
  const themedAssets = THEMED_SELF_DICE_FACE_ASSETS[String(themeId || "")];
  return (themedAssets && themedAssets[key]) || getDieAsset(key);
}

function mapDicePointsToAssets(points) {
  return (Array.isArray(points) ? points : []).map((point) => getDieAsset(point));
}

const HOME_HERO_DICE_ASSETS = mapDicePointsToAssets([5, 2, 1]);
const LOBBY_FLOAT_DICE_ASSETS = mapDicePointsToAssets([5, 2]);
const LOBBY_CREATE_DIE_ASSET = getDieAsset(5);

module.exports = {
  DICE_FACE_ASSETS,
  THEMED_SELF_DICE_FACE_ASSETS,
  DEFAULT_3D_DIE_ASSET,
  SELF_DICE_PLACEHOLDER,
  HOME_HERO_DICE_ASSETS,
  LOBBY_FLOAT_DICE_ASSETS,
  LOBBY_CREATE_DIE_ASSET,
  getDieAsset,
  getSelfDieAsset
};
