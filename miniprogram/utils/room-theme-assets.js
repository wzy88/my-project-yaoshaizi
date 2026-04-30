const DEFAULT_MENU_ICON_SRC = "/assets/figma-room-v2/topbar-menu-icon.svg";
const DEFAULT_PRIMARY_ICON_SRC = "/assets/figma-room-v2/die-cube-gold.svg";

const ROOM_THEME_ASSET_MAP = {
  "jade-green": {
    menuIconSrc: DEFAULT_MENU_ICON_SRC,
    primaryIconSrc: DEFAULT_PRIMARY_ICON_SRC,
    primaryButtonSrc: "",
    openButtonSrc: "",
    secondaryIconSrc: "",
    pageBackgroundSrc: "",
    bubbleSkinSrc: "",
    cupSkinSrc: "",
    selfCupTextureSrc: "",
    tableclothSrc: "",
    primaryButtonClass: "",
    secondaryButtonClass: "room-fab-secondary--jade-open"
  },
  "ruby-red": {
    menuIconSrc: "/assets/room-themes/ruby-red-menu-btn-black.png",
    primaryIconSrc: "/assets/room-themes/ruby-red-die-black.svg",
    primaryButtonSrc: "/assets/room-themes/ruby-red-call-btn-black.png",
    openButtonSrc: "/assets/room-themes/ruby-red-open-btn-black.png",
    secondaryIconSrc: "",
    pageBackgroundSrc: "/assets/room-themes/ruby-red-bg-black.jpg",
    bubbleSkinSrc: "",
    cupSkinSrc: "/assets/room-themes/ruby-red-cup-black.png",
    selfCupTextureSrc: "/assets/room-themes/ruby-red-bg-black.jpg",
    tableclothSrc: "/assets/room-themes/ruby-red-tablecloth-black-v2.jpg",
    primaryButtonClass: "room-fab--ruby-slice",
    secondaryButtonClass: "room-fab-secondary--ruby-slice"
  },
  "imperial-red": {
    menuIconSrc: "/assets/room-themes/imperial-red-menu-btn.png",
    primaryIconSrc: "/assets/room-themes/imperial-red-die.png",
    primaryButtonSrc: "/assets/room-themes/imperial-red-call-btn.png",
    openButtonSrc: "/assets/room-themes/imperial-red-open-btn.png",
    secondaryIconSrc: "",
    pageBackgroundSrc: "/assets/room-themes/imperial-red-bg-v2.jpg",
    bubbleSkinSrc: "",
    cupSkinSrc: "/assets/room-themes/imperial-red-cup.png",
    selfCupTextureSrc: "",
    tableclothSrc: "",
    primaryButtonClass: "room-fab--imperial-slice",
    secondaryButtonClass: "room-fab-secondary--imperial-slice"
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
