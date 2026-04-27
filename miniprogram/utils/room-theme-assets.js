const DEFAULT_MENU_ICON_SRC = "/assets/figma-room-v2/topbar-menu-icon.svg";
const DEFAULT_PRIMARY_ICON_SRC = "/assets/figma-room-v2/die-cube-gold.svg";

const ROOM_THEME_ASSET_MAP = {
  "jade-green": {
    menuIconSrc: DEFAULT_MENU_ICON_SRC,
    primaryIconSrc: DEFAULT_PRIMARY_ICON_SRC,
    primaryButtonClass: "",
    secondaryButtonClass: ""
  },
  "ruby-red": {
    menuIconSrc: "/assets/room-themes/ruby-red-menu-btn-black.png",
    primaryIconSrc: "/assets/room-themes/ruby-red-die-black.png",
    primaryButtonClass: "room-fab--ruby-slice",
    secondaryButtonClass: "room-fab-secondary--ruby-slice"
  },
  "sapphire-blue": {
    menuIconSrc: "/assets/room-themes/sapphire-blue-menu-btn.png",
    primaryIconSrc: "/assets/room-themes/sapphire-blue-die.png",
    primaryButtonClass: "room-fab--sapphire-slice",
    secondaryButtonClass: "room-fab-secondary--sapphire-slice"
  },
  "imperial-red": {
    menuIconSrc: "/assets/room-themes/imperial-red-menu-btn.png",
    primaryIconSrc: "/assets/room-themes/imperial-red-die.png",
    primaryButtonClass: "room-fab--imperial-slice",
    secondaryButtonClass: "room-fab-secondary--imperial-slice"
  },
  "mist-ivory": {
    menuIconSrc: DEFAULT_MENU_ICON_SRC,
    primaryIconSrc: "/assets/room-themes/mist-ivory-seal-die.svg",
    primaryButtonClass: "",
    secondaryButtonClass: ""
  }
};

function getRoomThemeAssets(themeId) {
  return ROOM_THEME_ASSET_MAP[String(themeId || "").trim()] || ROOM_THEME_ASSET_MAP["jade-green"];
}

module.exports = {
  DEFAULT_MENU_ICON_SRC,
  DEFAULT_PRIMARY_ICON_SRC,
  ROOM_THEME_ASSET_MAP,
  getRoomThemeAssets
};
