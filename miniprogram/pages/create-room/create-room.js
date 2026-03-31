const { NICKNAME_KEY } = require("../../utils/constants");
const { isDevtoolsPlatform } = require("../../utils/system-info");

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

Page({
  data: {
    nickname: "",
    playerCountOptions: [2, 3, 4, 5, 6, 7, 8],
    playerCount: 4,
    allowSpectator: true,
    lockRoom: false,
    wildcardOneEnabled: true,
    testMode: false,
    devtoolsMode: false
  },

  onLoad(options) {
    const optNickname = safeDecodeComponent(options && options.nickname).trim();
    const cachedNickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    const nickname = optNickname || cachedNickname;
    this.setData({
      nickname: nickname || `玩家${Math.floor(Math.random() * 1000)}`,
      devtoolsMode: isDevtoolsPlatform()
    });
  },

  onSelectPlayerCount(event) {
    const value = Number(event.currentTarget.dataset.value);
    if (!Number.isInteger(value) || value < 2 || value > 8) return;
    this.setData({ playerCount: value });
  },

  onToggleField(event) {
    const field = String(event.currentTarget.dataset.field || "");
    if (!field || typeof this.data[field] !== "boolean") return;
    this.setData({ [field]: !this.data[field] });
  },

  createAndEnter() {
    const direction = "cw";
    const dicePerPlayer = 5;
    const minOpeningCount = 5;

    wx.navigateTo({
      url: `/pages/room/room?mode=create&forceNew=1&nickname=${encodeURIComponent(this.data.nickname || "")}&direction=${direction}&wildcardOneEnabled=${this.data.wildcardOneEnabled ? "1" : "0"}&dicePerPlayer=${dicePerPlayer}&minOpeningCount=${minOpeningCount}&testMode=${this.data.testMode ? "1" : "0"}&playerCount=${this.data.playerCount}&allowSpectator=${this.data.allowSpectator ? "1" : "0"}&lockRoom=${this.data.lockRoom ? "1" : "0"}`
    });
  },

  back() {
    wx.navigateBack();
  }
});
