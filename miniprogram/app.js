const { WS_URL_KEY } = require("./utils/constants");

App({
  globalData: {
    wsUrl: "ws://127.0.0.1:3000/ws",
    isDevtoolsMode: false
  },
  onLaunch() {
    try {
      const cached = wx.getStorageSync(WS_URL_KEY);
      if (cached && typeof cached === "string") {
        this.globalData.wsUrl = cached.trim();
      }
    } catch {
      // ignore storage read failure
    }

    try {
      const info = wx.getSystemInfoSync();
      this.globalData.isDevtoolsMode = Boolean(info && info.platform === "devtools");
    } catch {
      this.globalData.isDevtoolsMode = false;
    }
  }
});
