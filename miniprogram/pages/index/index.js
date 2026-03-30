function buildTimeText() {
  const date = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

Page({
  data: {
    timeText: "09:41"
  },

  onShow() {
    this.setData({ timeText: buildTimeText() });
  },

  onWechatLogin() {
    wx.switchTab({
      url: "/pages/lobby/lobby"
    });
  },

  openPrivacyPage() {
    wx.navigateTo({ url: "/pages/legal/privacy/privacy" });
  },

  openTermsPage() {
    wx.navigateTo({ url: "/pages/legal/terms/terms" });
  }
});
