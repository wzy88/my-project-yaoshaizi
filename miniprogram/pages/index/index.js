const app = getApp();
const { HOME_HERO_DICE_ASSETS } = require("../../utils/dice-assets");
const { resolveContainerConfig, hasContainerService } = require("../../utils/cloud-container");
const backendRequest = require("../../utils/backend-request");
const { performWechatOneTapLogin } = require("../../utils/wechat-login-flow");
const {
  getStoredWechatProfile,
  navigateAfterWechatLogin,
  persistLegalConsent
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
    wsUrl: String(globalData.wsUrl || "").trim(),
    containerConfig: resolveContainerConfig(globalData.containerConfig || {})
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
  const containerConfig = resolveContainerConfig(source.containerConfig || {});
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
  const containerConfig = resolveContainerConfig(source.containerConfig || {});

  if (!hasContainerService(containerConfig) && !wsUrl) {
    return "当前服务暂不可用，请稍后再试";
  }

  if (wsUrl && !/^wss?:\/\//i.test(wsUrl)) {
    return "当前服务连接异常，请稍后再试";
  }

  return "当前服务暂不可用，请稍后再试";
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
    homeLogoAsset: "/assets/home-logo.jpg",
    heroDiceAssets: HOME_HERO_DICE_ASSETS,
    devtoolsMode: false,
    loginBusy: false,
    loginHintText: "不强制登录，进入大厅后需要创建或加入房间时再授权即可",
    backendReady: false,
    connectionHintText: "",
    profileTitle: "",
    pendingRedirectUrl: "/pages/lobby/lobby"
  },

  onLoad(options = {}) {
    const profile = getStoredWechatProfile();
    this.didAutoRoute = false;

    this.setData({
      devtoolsMode: Boolean(app && app.globalData && app.globalData.isDevtoolsMode),
      timeText: buildTimeText(),
      profileTitle: profile.loggedIn ? `欢迎回来，${profile.nickname}` : "准备开局",
      pendingRedirectUrl: decodeRedirect(options.redirect),
      loginHintText: profile.loggedIn ? "登录状态有效，正在进入..." : "不强制登录，进入大厅后需要创建或加入房间时再授权即可",
      ...buildConnectionState()
    });
  },

  onShow() {
    const profile = getStoredWechatProfile();
    this.setData({
      timeText: buildTimeText(),
      profileTitle: profile.loggedIn ? `欢迎回来，${profile.nickname}` : "准备开局",
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

  goLobby() {
    wx.switchTab({
      url: "/pages/lobby/lobby"
    });
  },

  async onWechatLogin() {
    if (this.data.loginBusy) {
      return;
    }

    const connectionState = buildConnectionState();
    this.setData(connectionState);
    if (!connectionState.backendReady) {
      wx.showToast({
        title: connectionState.connectionHintText || "当前服务暂不可用，请稍后再试",
        icon: "none"
      });
      return;
    }

    this.setData({
      loginBusy: true,
      loginHintText: "正在登录并生成默认资料..."
    });

    try {
      const result = await performWechatOneTapLogin();
      const profile = result && result.profile ? result.profile : getStoredWechatProfile();
      persistLegalConsent();
      this.didAutoRoute = true;
      this.setData({
        profileTitle: profile.loggedIn ? `欢迎回来，${profile.nickname}` : "准备开局",
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
