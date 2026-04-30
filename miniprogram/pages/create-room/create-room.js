const app = getApp();
const { NICKNAME_KEY } = require("../../utils/constants");
const { LOBBY_FLOAT_DICE_ASSETS, LOBBY_CREATE_DIE_ASSET } = require("../../utils/dice-assets");
const {
  DEFAULT_ROOM_THEME_ID,
  ROOM_THEME_IDS,
  normalizeRoomThemeId,
  getRoomThemeLabel
} = require("../../utils/room-themes");
const { loadRoomThemeManifest } = require("../../utils/room-theme-loader");

function safeDecodeComponent(raw) {
  const value = String(raw || "");
  if (!value) return "";
  if (!/%[0-9a-fA-F]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function buildThemeOptions() {
  return ROOM_THEME_IDS.map((id) => ({
    id,
    label: getRoomThemeLabel(id),
    badge: id === "jade-green" ? "默认" : "限免"
  }));
}

Page({
  data: {
    nickname: "",
    devtoolsMode: false,
    floatDiceAssets: LOBBY_FLOAT_DICE_ASSETS,
    createButtonDieAsset: LOBBY_CREATE_DIE_ASSET,
    playerCount: 8,
    wildcardOneEnabled: true,
    roomThemeOptions: buildThemeOptions(),
    themePreviewId: DEFAULT_ROOM_THEME_ID,
    themePreviewLabel: getRoomThemeLabel(DEFAULT_ROOM_THEME_ID)
  },

  onLoad(options) {
    const optNickname = safeDecodeComponent(options && options.nickname).trim();
    const cachedNickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    const nickname = optNickname || cachedNickname;
    const devtoolsMode = Boolean(app && app.globalData && app.globalData.isDevtoolsMode);
    const themePreviewId = normalizeRoomThemeId(options && options.themeId);
    this.setData({
      devtoolsMode,
      nickname: nickname || `玩家${Math.floor(Math.random() * 1000)}`,
      themePreviewId
    }, () => {
      this.syncThemePreviewLabel();
      this.prefetchTheme(themePreviewId);
    });
  },

  syncThemePreviewLabel() {
    const themePreviewId = normalizeRoomThemeId(this.data.themePreviewId || DEFAULT_ROOM_THEME_ID);
    this.setData({
      themePreviewLabel: getRoomThemeLabel(themePreviewId)
    });
  },

  onToggleField(event) {
    const field = String(event.currentTarget.dataset.field || "");
    if (!field || typeof this.data[field] !== "boolean") return;
    this.setData({ [field]: !this.data[field] });
  },

  onSelectTheme(event) {
    const themeId = normalizeRoomThemeId(event.currentTarget.dataset.themeId);
    if (themeId === this.data.themePreviewId) {
      return;
    }
    this.setData({ themePreviewId: themeId }, () => {
      this.syncThemePreviewLabel();
      this.prefetchTheme(themeId);
    });
  },

  prefetchTheme(themeId) {
    void loadRoomThemeManifest(normalizeRoomThemeId(themeId), {
      preferRemote: true,
      downloadAssets: true
    }).catch(() => {});
  },

  createAndEnter() {
    const direction = "cw";
    const dicePerPlayer = 5;
    const minOpeningCount = 5;
    const themeId = normalizeRoomThemeId(this.data.themePreviewId || DEFAULT_ROOM_THEME_ID);

    wx.navigateTo({
      url: `/pages/room/room?mode=create&forceNew=1&nickname=${encodeURIComponent(this.data.nickname || "")}&direction=${direction}&wildcardOneEnabled=${this.data.wildcardOneEnabled ? "1" : "0"}&dicePerPlayer=${dicePerPlayer}&minOpeningCount=${minOpeningCount}&testMode=0&themeId=${themeId}`
    });
  },

  back() {
    const stack = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (stack.length > 1 && wx.navigateBack && typeof wx.navigateBack === "function") {
      wx.navigateBack({ delta: 1 });
      return;
    }

    if (wx.switchTab && typeof wx.switchTab === "function") {
      wx.switchTab({ url: "/pages/lobby/lobby" });
      return;
    }

    if (wx.reLaunch && typeof wx.reLaunch === "function") {
      wx.reLaunch({ url: "/pages/lobby/lobby" });
    }
  }
});
