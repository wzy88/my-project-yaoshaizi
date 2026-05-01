import type { RoomThemeId, RoomThemeManifestDTO } from "@dice/shared";

export const DEFAULT_ROOM_THEME_ID: RoomThemeId = "jade-green";
export const ROOM_THEME_IDS: RoomThemeId[] = ["jade-green", "ruby-red", "imperial-red", "glacier-blue"];

const ROOM_THEME_LABELS: Record<RoomThemeId, string> = {
  "jade-green": "青岚",
  "ruby-red": "玄曜",
  "imperial-red": "绛华",
  "glacier-blue": "霁雪"
};

const ROOM_THEME_ALIASES: Record<string, RoomThemeId> = {
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

const ROOM_THEME_VERSIONS: Record<RoomThemeId, string> = {
  "jade-green": "2026.05.01.1",
  "ruby-red": "2026.05.01.2",
  "imperial-red": "2026.05.01.2",
  "glacier-blue": "2026.05.01.2"
};

const BUNDLED_THEME_ASSET_ROOT = "/pages/room/assets/room-themes";
const REMOTE_THEME_ASSET_BASE_URL = String(process.env.DICE_ROOM_THEME_CDN_BASE_URL || "").trim().replace(/\/+$/, "");

interface ThemeCatalogEntry {
  assets: Omit<RoomThemeManifestDTO["assets"], "dice">;
  dicePrefix: string;
  tokens: Record<string, string>;
}

const THEME_CATALOG: Record<RoomThemeId, ThemeCatalogEntry> = {
  "jade-green": {
    assets: {
      menuIconSrc: "/assets/figma-room-v2/topbar-menu-icon.svg",
      primaryIconSrc: "/assets/figma-room-v2/die-cube-gold.svg",
      primaryButtonSrc: "",
      openButtonSrc: "",
      secondaryIconSrc: "",
      pageBackgroundSrc: `${BUNDLED_THEME_ASSET_ROOT}/jade-green-bg-v1.jpg`,
      bubbleSkinSrc: "",
      cupSkinSrc: "",
      selfCupTextureSrc: "",
      tableclothSrc: `${BUNDLED_THEME_ASSET_ROOT}/jade-green-tablecloth-v1.jpg`,
      primaryButtonClass: "",
      secondaryButtonClass: "room-fab-secondary--jade-open"
    },
    dicePrefix: "jade-green-die-face",
    tokens: {
      accent: "#EBCB8A",
      table: "#2D6B58",
      text: "#F7F4EE"
    }
  },
  "ruby-red": {
    assets: {
      menuIconSrc: `${BUNDLED_THEME_ASSET_ROOT}/ruby-red-menu-btn-black.png`,
      primaryIconSrc: `${BUNDLED_THEME_ASSET_ROOT}/ruby-red-die-black.svg`,
      primaryButtonSrc: "",
      openButtonSrc: "",
      secondaryIconSrc: "",
      pageBackgroundSrc: `${BUNDLED_THEME_ASSET_ROOT}/ruby-red-bg-black.jpg`,
      bubbleSkinSrc: "",
      cupSkinSrc: `${BUNDLED_THEME_ASSET_ROOT}/ruby-red-cup-black.png`,
      selfCupTextureSrc: `${BUNDLED_THEME_ASSET_ROOT}/ruby-red-bg-black.jpg`,
      tableclothSrc: `${BUNDLED_THEME_ASSET_ROOT}/ruby-red-tablecloth-black-v3.jpg`,
      primaryButtonClass: "room-fab--ruby-slice",
      secondaryButtonClass: "room-fab-secondary--ruby-slice"
    },
    dicePrefix: "ruby-red-die-face",
    tokens: {
      accent: "#F8D978",
      table: "#151013",
      text: "#FFF4D6"
    }
  },
  "imperial-red": {
    assets: {
      menuIconSrc: `${BUNDLED_THEME_ASSET_ROOT}/imperial-red-menu-btn.png`,
      primaryIconSrc: `${BUNDLED_THEME_ASSET_ROOT}/imperial-red-die.png`,
      primaryButtonSrc: "",
      openButtonSrc: "",
      secondaryIconSrc: "",
      pageBackgroundSrc: `${BUNDLED_THEME_ASSET_ROOT}/imperial-red-bg-palace-v5.svg`,
      bubbleSkinSrc: "",
      cupSkinSrc: `${BUNDLED_THEME_ASSET_ROOT}/imperial-red-cup-jade.svg`,
      selfCupTextureSrc: "",
      tableclothSrc: `${BUNDLED_THEME_ASSET_ROOT}/imperial-red-table-palace-v5.svg`,
      primaryButtonClass: "room-fab--imperial-slice",
      secondaryButtonClass: "room-fab-secondary--imperial-slice"
    },
    dicePrefix: "imperial-red-die-face",
    tokens: {
      accent: "#D8B65E",
      table: "#8E1F20",
      text: "#FFF2D8"
    }
  },
  "glacier-blue": {
    assets: {
      menuIconSrc: `${BUNDLED_THEME_ASSET_ROOT}/glacier-blue-menu-btn.svg`,
      primaryIconSrc: `${BUNDLED_THEME_ASSET_ROOT}/glacier-blue-die.svg`,
      primaryButtonSrc: "",
      openButtonSrc: "",
      secondaryIconSrc: "",
      pageBackgroundSrc: `${BUNDLED_THEME_ASSET_ROOT}/glacier-blue-bg-v1.svg`,
      bubbleSkinSrc: "",
      cupSkinSrc: `${BUNDLED_THEME_ASSET_ROOT}/glacier-blue-cup.svg`,
      selfCupTextureSrc: "",
      tableclothSrc: `${BUNDLED_THEME_ASSET_ROOT}/glacier-blue-tablecloth-v1.svg`,
      primaryButtonClass: "room-fab--glacier-slice",
      secondaryButtonClass: "room-fab-secondary--glacier-slice"
    },
    dicePrefix: "glacier-blue-die-face",
    tokens: {
      accent: "#7ED6F7",
      table: "#143E57",
      text: "#F7FCFF"
    }
  }
};

export function normalizeRoomThemeId(input: unknown): RoomThemeId {
  const value = String(input || "").trim();
  const aliased = ROOM_THEME_ALIASES[value] || ROOM_THEME_ALIASES[value.toLowerCase()];
  return aliased || DEFAULT_ROOM_THEME_ID;
}

function maybeRemoteAsset(themeId: RoomThemeId, src: string): string {
  if (!src || !REMOTE_THEME_ASSET_BASE_URL || !src.startsWith(BUNDLED_THEME_ASSET_ROOT)) {
    return src;
  }

  const fileName = src.slice(BUNDLED_THEME_ASSET_ROOT.length).replace(/^\/+/, "");
  return `${REMOTE_THEME_ASSET_BASE_URL}/${themeId}/${fileName}`;
}

function buildDiceAssets(themeId: RoomThemeId, dicePrefix: string): Record<string, string> {
  return [1, 2, 3, 4, 5, 6].reduce<Record<string, string>>((acc, point) => {
    acc[String(point)] = maybeRemoteAsset(themeId, `${BUNDLED_THEME_ASSET_ROOT}/${dicePrefix}-${point}.svg`);
    return acc;
  }, {});
}

function buildAssets(themeId: RoomThemeId, entry: ThemeCatalogEntry): RoomThemeManifestDTO["assets"] {
  const assets: RoomThemeManifestDTO["assets"] = {};
  for (const [key, value] of Object.entries(entry.assets)) {
    (assets as Record<string, string>)[key] = maybeRemoteAsset(themeId, String(value || ""));
  }
  assets.dice = buildDiceAssets(themeId, entry.dicePrefix);
  return assets;
}

function pickCriticalAssets(assets: RoomThemeManifestDTO["assets"]): string[] {
  return [
    assets.pageBackgroundSrc,
    assets.tableclothSrc,
    assets.cupSkinSrc,
    assets.primaryButtonSrc,
    assets.openButtonSrc,
    assets.primaryIconSrc
  ].filter((src): src is string => Boolean(src));
}

export function getRoomThemeManifest(themeId: unknown, lockedVersion = ""): RoomThemeManifestDTO {
  const normalizedThemeId = normalizeRoomThemeId(themeId);
  const entry = THEME_CATALOG[normalizedThemeId];
  const assets = buildAssets(normalizedThemeId, entry);
  const label = ROOM_THEME_LABELS[normalizedThemeId];
  const version = String(lockedVersion || ROOM_THEME_VERSIONS[normalizedThemeId]).trim() || ROOM_THEME_VERSIONS[normalizedThemeId];

  return {
    id: normalizedThemeId,
    version,
    label,
    className: `room-theme-${normalizedThemeId}`,
    delivery: REMOTE_THEME_ASSET_BASE_URL ? "remote" : "bundled",
    assets,
    criticalAssets: pickCriticalAssets(assets),
    tokens: {
      ...entry.tokens,
      themeId: normalizedThemeId
    },
    loading: {
      title: `正在布置「${label}」房间`,
      steps: ["同步主题配置", "加载桌面资源", "准备骰盅与按钮", "进入房间"]
    }
  };
}

export function listRoomThemeManifests(): RoomThemeManifestDTO[] {
  return ROOM_THEME_IDS.map((themeId) => getRoomThemeManifest(themeId));
}
