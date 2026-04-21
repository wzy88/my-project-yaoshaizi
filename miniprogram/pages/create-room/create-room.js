const { NICKNAME_KEY } = require("../../utils/constants");

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
    playerCount: 8,
    wildcardOneEnabled: true
  },

  onLoad(options) {
    const optNickname = safeDecodeComponent(options && options.nickname).trim();
    const cachedNickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    const nickname = optNickname || cachedNickname;
    this.setData({
      nickname: nickname || `玩家${Math.floor(Math.random() * 1000)}`
    });
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
      url: `/pages/room/room?mode=create&forceNew=1&nickname=${encodeURIComponent(this.data.nickname || "")}&direction=${direction}&wildcardOneEnabled=${this.data.wildcardOneEnabled ? "1" : "0"}&dicePerPlayer=${dicePerPlayer}&minOpeningCount=${minOpeningCount}&testMode=0`
    });
  },

  back() {
    wx.navigateBack();
  }
});
