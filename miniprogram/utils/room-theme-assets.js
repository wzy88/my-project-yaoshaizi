const DEFAULT_MENU_ICON_SRC = "/assets/figma-room-v2/topbar-menu-icon.svg";
const DEFAULT_PRIMARY_ICON_SRC = "/assets/figma-room-v2/die-cube-gold.svg";
const runtimeRoomThemeAssets = {};

const ROOM_THEME_ASSET_MAP = {
  "jade-green": {
    menuIconSrc: DEFAULT_MENU_ICON_SRC,
    primaryIconSrc: DEFAULT_PRIMARY_ICON_SRC,
    primaryButtonSrc: "",
    openButtonSrc: "",
    secondaryIconSrc: "",
    pageBackgroundSrc: "/pages/room/assets/room-themes/jade-green-bg-v1.jpg",
    bubbleSkinSrc: "",
    cupSkinSrc: "",
    selfCupTextureSrc: "",
    tableclothSrc: "/pages/room/assets/room-themes/jade-green-tablecloth-v1.jpg",
    primaryButtonClass: "",
    secondaryButtonClass: "room-fab-secondary--jade-open"
  },
  "ruby-red": {
    menuIconSrc: "/pages/room/assets/room-themes/ruby-red-menu-btn-black.png",
    primaryIconSrc: "/pages/room/assets/room-themes/ruby-red-die-black.svg",
    primaryButtonSrc: "/pages/room/assets/room-themes/ruby-red-call-btn-black.png",
    openButtonSrc: "/pages/room/assets/room-themes/ruby-red-open-btn-black.png",
    secondaryIconSrc: "",
    pageBackgroundSrc: "/pages/room/assets/room-themes/ruby-red-bg-black.jpg",
    bubbleSkinSrc: "",
    cupSkinSrc: "/pages/room/assets/room-themes/ruby-red-cup-black.png",
    selfCupTextureSrc: "/pages/room/assets/room-themes/ruby-red-bg-black.jpg",
    tableclothSrc: "/pages/room/assets/room-themes/ruby-red-tablecloth-black-v3.jpg",
    primaryButtonClass: "room-fab--ruby-slice",
    secondaryButtonClass: "room-fab-secondary--ruby-slice"
  },
  "imperial-red": {
    menuIconSrc: "/pages/room/assets/room-themes/imperial-red-menu-btn.png",
    primaryIconSrc: "/pages/room/assets/room-themes/imperial-red-die.png",
    primaryButtonSrc: "/pages/room/assets/room-themes/imperial-red-call-btn-jade.svg",
    openButtonSrc: "/pages/room/assets/room-themes/imperial-red-open-btn-jade.svg",
    secondaryIconSrc: "",
    pageBackgroundSrc: "/pages/room/assets/room-themes/imperial-red-bg-palace-v5.svg",
    bubbleSkinSrc: "",
    cupSkinSrc: "/pages/room/assets/room-themes/imperial-red-cup-jade.svg",
    selfCupTextureSrc: "",
    tableclothSrc: "/pages/room/assets/room-themes/imperial-red-table-palace-v5.svg",
    primaryButtonClass: "room-fab--imperial-slice",
    secondaryButtonClass: "room-fab-secondary--imperial-slice"
  },
  "glacier-blue": {
    menuIconSrc: "/pages/room/assets/room-themes/glacier-blue-menu-btn.svg",
    primaryIconSrc: "/pages/room/assets/room-themes/glacier-blue-die.svg",
    primaryButtonSrc: "/pages/room/assets/room-themes/glacier-blue-call-btn.svg",
    openButtonSrc: "/pages/room/assets/room-themes/glacier-blue-open-btn.svg",
    secondaryIconSrc: "",
    pageBackgroundSrc: "/pages/room/assets/room-themes/glacier-blue-bg-v1.svg",
    bubbleSkinSrc: "",
    cupSkinSrc: "/pages/room/assets/room-themes/glacier-blue-cup.svg",
    selfCupTextureSrc: "",
    tableclothSrc: "/pages/room/assets/room-themes/glacier-blue-tablecloth-v1.svg",
    primaryButtonClass: "room-fab--glacier-slice",
    secondaryButtonClass: "room-fab-secondary--glacier-slice"
  }
};

function normalizeRoomThemeAssetPatch(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return [
    "menuIconSrc",
    "primaryIconSrc",
    "primaryButtonSrc",
    "openButtonSrc",
    "secondaryIconSrc",
    "pageBackgroundSrc",
    "bubbleSkinSrc",
    "cupSkinSrc",
    "selfCupTextureSrc",
    "tableclothSrc",
    "primaryButtonClass",
    "secondaryButtonClass"
  ].reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      acc[key] = String(source[key] || "");
    }
    return acc;
  }, {});
}

function registerRuntimeRoomThemeAssets(themeId, rawAssets) {
  const id = String(themeId || "").trim();
  if (!id) {
    return getRoomThemeAssets("jade-green");
  }

  const fallback = ROOM_THEME_ASSET_MAP[id] || ROOM_THEME_ASSET_MAP["jade-green"];
  runtimeRoomThemeAssets[id] = {
    ...fallback,
    ...normalizeRoomThemeAssetPatch(rawAssets)
  };
  return runtimeRoomThemeAssets[id];
}

function getRoomThemeAssets(themeId) {
  const id = String(themeId || "").trim();
  return runtimeRoomThemeAssets[id] || ROOM_THEME_ASSET_MAP[id] || ROOM_THEME_ASSET_MAP["jade-green"];
}

module.exports = {
  DEFAULT_MENU_ICON_SRC,
  DEFAULT_PRIMARY_ICON_SRC,
  ROOM_THEME_ASSET_MAP,
  registerRuntimeRoomThemeAssets,
  getRoomThemeAssets
};
