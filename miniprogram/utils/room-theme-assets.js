const DEFAULT_MENU_ICON_SRC = "/assets/figma-room-v2/topbar-menu-icon.svg";
const DEFAULT_PRIMARY_ICON_SRC = "/assets/figma-room-v2/die-cube-gold.svg";

const ROOM_THEME_ASSET_MAP = {
  "ruby-red": {
    menuIconSrc: "/assets/room-themes/ruby-red-menu-btn-black.png",
    primaryIconSrc: "/assets/room-themes/ruby-red-die-black.svg",
    openButtonSrc: "/assets/room-themes/ruby-red-open-btn-black.png",
    secondaryIconSrc: "",
    tableclothSrc: "/assets/room-themes/ruby-red-tablecloth-black-v2.jpg",
    primaryButtonClass: "",
    secondaryButtonClass: "room-fab-secondary--ruby-slice"
  },
  "imperial-red": {
    menuIconSrc: "/assets/room-themes/imperial-red-menu-btn.png",
    primaryIconSrc: "/assets/room-themes/imperial-red-die.png",
    openButtonSrc: "",
    secondaryIconSrc: "",
    tableclothSrc: "",
    primaryButtonClass: "room-fab--imperial-slice",
    secondaryButtonClass: "room-fab-secondary--imperial-slice"
  }
};

function getRoomThemeAssets(themeId) {
  return ROOM_THEME_ASSET_MAP[String(themeId || "").trim()] || ROOM_THEME_ASSET_MAP["imperial-red"];
}

module.exports = {
  DEFAULT_MENU_ICON_SRC,
  DEFAULT_PRIMARY_ICON_SRC,
  ROOM_THEME_ASSET_MAP,
  getRoomThemeAssets
};
