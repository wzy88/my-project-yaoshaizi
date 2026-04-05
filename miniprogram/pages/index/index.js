const app = getApp();
const { HOME_HERO_DICE_ASSETS } = require("../../utils/dice-assets");
const {
  WS_URL_KEY,
  CLOUD_ENV_ID_KEY,
  CLOUD_SERVICE_KEY,
  CLOUD_WS_PATH_KEY
} = require("../../utils/constants");
const {
  DEFAULT_CONTAINER_WS_PATH,
  normalizeContainerConfig,
  hasContainerService,
  initMiniProgramCloud
} = require("../../utils/cloud-container");
const backendRequest = require("../../utils/backend-request");
const { performWechatOneTapLogin } = require("../../utils/wechat-login-flow");
const {
  getStoredWechatProfile,
  navigateAfterWechatLogin
} = require("../../utils/wechat-auth");

function buildTimeText() {
  const date = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function decodeRedirect(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "/pages/lobby/lobby";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getRuntimeConnectionCompat() {
  if (backendRequest && typeof backendRequest.getRuntimeConnection === "function") {
    return backendRequest.getRuntimeConnection();
  }

  const globalData = app && app.globalData ? app.globalData : {};
  return {
    wsUrl: String(
      globalData.wsUrl ||
      (globalThis.wx && typeof globalThis.wx.getStorageSync === "function"
        ? globalThis.wx.getStorageSync(WS_URL_KEY)
        : "") ||
      ""
    ).trim(),
    containerConfig: normalizeContainerConfig(globalData.containerConfig || {
      envId: globalThis.wx && typeof globalThis.wx.getStorageSync === "function"
        ? globalThis.wx.getStorageSync(CLOUD_ENV_ID_KEY)
        : "",
      service: globalThis.wx && typeof globalThis.wx.getStorageSync === "function"
        ? globalThis.wx.getStorageSync(CLOUD_SERVICE_KEY)
        : "",
      wsPath: globalThis.wx && typeof globalThis.wx.getStorageSync === "function"
        ? globalThis.wx.getStorageSync(CLOUD_WS_PATH_KEY)
        : ""
    })
  };
}

function hasBackendConnectionCompat(connection) {
  if (backendRequest && typeof backendRequest.hasBackendConnection === "function") {
    return backendRequest.hasBackendConnection(connection);
  }

  const source = connection && typeof connection === "object"
    ? connection
    : getRuntimeConnectionCompat();
  const wsUrl = String(source.wsUrl || "").trim();
  const containerConfig = normalizeContainerConfig(source.containerConfig || {});
  if (hasContainerService(containerConfig)) {
    return true;
  }

  const deriveHttpBaseUrl = backendRequest && typeof backendRequest.deriveHttpBaseUrl === "function"
    ? backendRequest.deriveHttpBaseUrl
    : () => "";
  return Boolean(deriveHttpBaseUrl(wsUrl, containerConfig.wsPath));
}

function buildMissingBackendMessageCompat(connection) {
  if (backendRequest && typeof backendRequest.buildMissingBackendMessage === "function") {
    return backendRequest.buildMissingBackendMessage(connection);
  }

  const source = connection && typeof connection === "object"
    ? connection
    : getRuntimeConnectionCompat();
  const wsUrl = String(source.wsUrl || "").trim();
  const containerConfig = normalizeContainerConfig(source.containerConfig || {});

  if (!hasContainerService(containerConfig) && !wsUrl) {
    return "未配置云托管服务，请先填写服务名，路径一般填 /ws";
  }

  if (wsUrl && !/^wss?:\/\//i.test(wsUrl)) {
    return "调试地址格式不正确，请使用 ws:// 或 wss://";
  }

  return "未配置后端服务地址";
}

function buildConnectionState() {
  const connection = getRuntimeConnectionCompat();
  const backendReady = hasBackendConnectionCompat(connection);
  return {
    backendReady,
    connectionHintText: backendReady ? "" : buildMissingBackendMessageCompat(connection)
  };
}

Page({
  data: {
    timeText: "09:41",
    heroDiceAssets: HOME_HERO_DICE_ASSETS,
    loginBusy: false,
    loginHintText: "点一下就能用微信登录并进入大厅",
    backendReady: false,
    connectionHintText: "",
    profileTitle: "",
    pendingRedirectUrl: "/pages/lobby/lobby"
  },

  onLoad(options = {}) {
    const profile = getStoredWechatProfile();
    this.didAutoRoute = false;

    this.setData({
      timeText: buildTimeText(),
      profileTitle: profile.nickname ? `欢迎回来，${profile.nickname}` : "准备开局",
      pendingRedirectUrl: decodeRedirect(options.redirect),
      loginHintText: profile.loggedIn ? "登录状态有效，正在进入..." : "点一下就能用微信登录并进入大厅",
      ...buildConnectionState()
    });
  },

  onShow() {
    const profile = getStoredWechatProfile();
    this.setData({
      timeText: buildTimeText(),
      profileTitle: profile.nickname ? `欢迎回来，${profile.nickname}` : "准备开局",
      ...buildConnectionState()
    });

    if (profile.loggedIn && !this.didAutoRoute) {
      this.didAutoRoute = true;
      navigateAfterWechatLogin(this.data.pendingRedirectUrl);
    }
  },

  onUnload() {
    this.didAutoRoute = false;
  },

  openConnectionSettings() {
    const runtimeConnection = getRuntimeConnectionCompat();
    const currentConfig = normalizeContainerConfig(runtimeConnection.containerConfig);

    wx.showModal({
      title: "云托管服务名",
      editable: true,
      placeholderText: "例如 dice-prod",
      content: currentConfig.service || "",
      success: (serviceRes) => {
        if (!serviceRes.confirm) return;

        const nextService = String(serviceRes.content || "").trim();
        if (!nextService) {
          wx.showToast({ title: "服务名不能为空", icon: "none" });
          return;
        }

        wx.showModal({
          title: "云托管环境ID",
          editable: true,
          placeholderText: "可留空，默认当前绑定环境",
          content: currentConfig.envId || "",
          success: (envRes) => {
            if (!envRes.confirm) return;

            const nextEnvId = String(envRes.content || "").trim();
            wx.showModal({
              title: "WebSocket 路径",
              editable: true,
              placeholderText: DEFAULT_CONTAINER_WS_PATH,
              content: currentConfig.wsPath || DEFAULT_CONTAINER_WS_PATH,
              success: (pathRes) => {
                if (!pathRes.confirm) return;

                const nextConfig = normalizeContainerConfig({
                  envId: nextEnvId,
                  service: nextService,
                  wsPath: pathRes.content
                });
                const initResult = initMiniProgramCloud(nextConfig);

                app.globalData.containerConfig = nextConfig;
                wx.setStorageSync(CLOUD_ENV_ID_KEY, nextConfig.envId);
                wx.setStorageSync(CLOUD_SERVICE_KEY, nextConfig.service);
                wx.setStorageSync(CLOUD_WS_PATH_KEY, nextConfig.wsPath);
                this.setData(buildConnectionState());

                wx.showToast({
                  title: initResult.ok ? "云托管已保存" : "已保存，真机再试",
                  icon: "none"
                });
              }
            });
          }
        });
      }
    });
  },

  async onWechatLogin() {
    if (this.data.loginBusy) {
      return;
    }

    const connectionState = buildConnectionState();
    this.setData(connectionState);
    if (!connectionState.backendReady) {
      wx.showToast({ title: "请先配置云托管", icon: "none" });
      return;
    }

    this.setData({
      loginBusy: true,
      loginHintText: "正在获取微信资料并登录..."
    });

    try {
      const result = await performWechatOneTapLogin();
      const profile = result && result.profile ? result.profile : getStoredWechatProfile();
      this.didAutoRoute = true;
      this.setData({
        profileTitle: profile.nickname ? `欢迎回来，${profile.nickname}` : "准备开局",
        loginHintText: "登录成功，正在进入..."
      });
      wx.showToast({ title: "登录成功", icon: "none" });
      navigateAfterWechatLogin(this.data.pendingRedirectUrl);
    } catch (error) {
      const message = error && error.message ? error.message : "微信登录失败";
      this.setData({ loginHintText: message });
      wx.showToast({ title: message, icon: "none" });
    } finally {
      this.setData({ loginBusy: false });
    }
  },

  openPrivacyPage() {
    wx.navigateTo({ url: "/pages/legal/privacy/privacy" });
  },

  openTermsPage() {
    wx.navigateTo({ url: "/pages/legal/terms/terms" });
  }
});
