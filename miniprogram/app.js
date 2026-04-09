const {
  getDefaultContainerConfig,
  initMiniProgramCloud
} = require("./utils/cloud-container");
const {
  resolveRuntimeConnection,
  hasFixedRuntimeConnection,
  clearLegacyRuntimeConnectionStorage
} = require("./utils/runtime-backend-config");
const { isDevtoolsPlatform } = require("./utils/system-info");

App({
  globalData: {
    wsUrl: "",
    containerConfig: getDefaultContainerConfig(),
    isDevtoolsMode: false
  },
  onLaunch() {
    try {
      const runtimeConnection = resolveRuntimeConnection({
        appGlobalData: this.globalData,
        includeLegacyStorage: true
      });
      this.globalData.wsUrl = runtimeConnection.wsUrl;
      this.globalData.containerConfig = runtimeConnection.containerConfig;

      if (hasFixedRuntimeConnection()) {
        clearLegacyRuntimeConnectionStorage();
      }

      initMiniProgramCloud(this.globalData.containerConfig);
    } catch (error) {
      this.globalData.wsUrl = "";
      this.globalData.containerConfig = getDefaultContainerConfig();
    }

    try {
      this.globalData.isDevtoolsMode = isDevtoolsPlatform();
    } catch (error) {
      this.globalData.isDevtoolsMode = false;
    }
  }
});
