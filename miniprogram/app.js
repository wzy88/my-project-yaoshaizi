const {
  WS_URL_KEY,
  CLOUD_ENV_ID_KEY,
  CLOUD_SERVICE_KEY,
  CLOUD_WS_PATH_KEY
} = require("./utils/constants");
const {
  getDefaultContainerConfig,
  resolveContainerConfig,
  initMiniProgramCloud
} = require("./utils/cloud-container");
const { isDevtoolsPlatform } = require("./utils/system-info");

App({
  globalData: {
    wsUrl: "ws://127.0.0.1:3000/ws",
    containerConfig: getDefaultContainerConfig(),
    isDevtoolsMode: false
  },
  onLaunch() {
    try {
      const cached = wx.getStorageSync(WS_URL_KEY);
      if (cached && typeof cached === "string") {
        this.globalData.wsUrl = cached.trim();
      }
    } catch (error) {
      // ignore storage read failure
    }

    try {
      this.globalData.containerConfig = resolveContainerConfig({
        envId: wx.getStorageSync(CLOUD_ENV_ID_KEY),
        service: wx.getStorageSync(CLOUD_SERVICE_KEY),
        wsPath: wx.getStorageSync(CLOUD_WS_PATH_KEY)
      });
      initMiniProgramCloud(this.globalData.containerConfig);
    } catch (error) {
      this.globalData.containerConfig = getDefaultContainerConfig();
    }

    try {
      this.globalData.isDevtoolsMode = isDevtoolsPlatform();
    } catch (error) {
      this.globalData.isDevtoolsMode = false;
    }
  }
});
