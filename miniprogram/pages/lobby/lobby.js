const app = getApp();
const { SESSION_KEY } = require("../../utils/constants");
const { LOBBY_FLOAT_DICE_ASSETS, LOBBY_CREATE_DIE_ASSET } = require("../../utils/dice-assets");
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

function buildLoginGateCopy(redirectUrl = "/pages/lobby/lobby") {
  const target = String(redirectUrl || "").trim();
  if (target.includes("/pages/create-room/create-room")) {
    return {
      title: "登录后创建房间",
      desc: "先浏览大厅，再在需要开局时主动登录，登录成功后会直接进入创建房间。"
    };
  }

  if (target.includes("/pages/room/room?resume=1")) {
    return {
      title: "登录后继续房间",
      desc: "当前操作需要确认你的身份，登录成功后会继续进入你上次的房间。"
    };
  }

  if (target.includes("/pages/room/room")) {
    return {
      title: "登录后加入房间",
      desc: "确认协议后即可继续当前加入操作，登录成功后会直接进入目标房间。"
    };
  }

  return {
    title: "登录后继续",
    desc: "你可以先浏览大厅，确定要继续当前操作时再登录。"
  };
}

function syncLobbyTabBar(page) {
  const tabBar = page.getTabBar && page.getTabBar();
  if (!tabBar || !tabBar.setData) {
    return;
  }

  tabBar.setData({
    selected: 0,
    hidden: Boolean(page.data.showLoginGate)
  });
}

Page({
  data: {
    timeText: "10:21",
    floatDiceAssets: LOBBY_FLOAT_DICE_ASSETS,
    createButtonDieAsset: LOBBY_CREATE_DIE_ASSET,
    nickname: "",
    avatarUrl: "",
    joinRoomId: "",
    loggedIn: false,
    showLoginGate: false,
    loginBusy: false,
    loginHintText: "你可以先浏览大厅，确认要继续时再登录",
    loginAgreementChecked: false,
    loginGateTitle: "登录后继续",
    loginGateDesc: "你可以先浏览大厅，确定要继续当前操作时再登录。",
    backendReady: false,
    connectionHintText: "",
    pendingRedirectUrl: "/pages/lobby/lobby",
    hasSession: false,
    sessionRoomId: ""
  },

  onLoad(options = {}) {
    this.didAutoRoute = false;
    this.setData({
      pendingRedirectUrl: decodeRedirect(options.redirect)
    });
    this.refreshLobbyState();
  },

  onShow() {
    const profile = this.refreshLobbyState();
    syncLobbyTabBar(this);

    if (
      profile.loggedIn &&
      !this.didAutoRoute &&
      this.data.pendingRedirectUrl &&
      this.data.pendingRedirectUrl !== "/pages/lobby/lobby"
    ) {
      this.didAutoRoute = true;
      navigateAfterWechatLogin(this.data.pendingRedirectUrl);
    }
  },

  refreshLobbyState(extra = {}) {
    const profile = getStoredWechatProfile();
    const session = wx.getStorageSync(SESSION_KEY);
    const hasSession = Boolean(session && session.roomId && session.playerId && session.resumeToken);

    this.setData({
      timeText: buildTimeText(),
      nickname: profile.nickname || "玩家001",
      avatarUrl: String(profile.avatarUrl || "").trim(),
      loggedIn: profile.loggedIn,
      showLoginGate: typeof extra.showLoginGate === "boolean" ? extra.showLoginGate : false,
      loginAgreementChecked: typeof extra.loginAgreementChecked === "boolean" ? extra.loginAgreementChecked : false,
      loginHintText: profile.loggedIn ? "已登录，现在可以直接组局" : "你可以先浏览大厅，确认要继续时再登录",
      hasSession,
      sessionRoomId: hasSession ? session.roomId : "",
      ...buildConnectionState(),
      ...extra
    });

    syncLobbyTabBar(this);

    return profile;
  },

  requireLogin(redirectUrl = "/pages/lobby/lobby") {
    this.didAutoRoute = false;
    const gateCopy = buildLoginGateCopy(redirectUrl);
    this.setData({
      showLoginGate: true,
      loginAgreementChecked: false,
      pendingRedirectUrl: decodeRedirect(redirectUrl),
      loginHintText: "勾选协议后再登录，即可继续当前操作",
      loginGateTitle: gateCopy.title,
      loginGateDesc: gateCopy.desc,
      ...buildConnectionState()
    });
    syncLobbyTabBar(this);
    return false;
  },

  closeLoginGate() {
    if (this.data.loginBusy) {
      return;
    }

    this.setData({
      showLoginGate: false,
      loginAgreementChecked: false,
      pendingRedirectUrl: "/pages/lobby/lobby",
      loginHintText: "你可以先浏览大厅，确认要继续时再登录",
      loginGateTitle: "登录后继续",
      loginGateDesc: "你可以先浏览大厅，确定要继续当前操作时再登录。"
    });
    syncLobbyTabBar(this);
  },

  toggleLoginAgreement() {
    this.setData({
      loginAgreementChecked: !this.data.loginAgreementChecked
    });
  },

  noop() {},

  onJoinRoomIdChange(event) {
    this.setData({ joinRoomId: String(event.detail.value || "").trim() });
  },

  goCreateRoom() {
    const targetUrl = "/pages/create-room/create-room";
    if (!this.data.loggedIn) {
      this.requireLogin(targetUrl);
      return;
    }

    wx.navigateTo({
      url: targetUrl
    });
  },

  async goJoinRoom() {
    if (!this.data.joinRoomId) {
      wx.showToast({ title: "请输入房间号", icon: "none" });
      return;
    }

    const roomId = String(this.data.joinRoomId || "").trim();
    if (!/^\d{6}$/.test(roomId)) {
      wx.showToast({ title: "房间不存在或房间号有误", icon: "none", duration: 5000 });
      return;
    }

    const targetUrl = `/pages/room/room?mode=join&forceNew=1&roomId=${encodeURIComponent(roomId)}`;
    if (!this.data.loggedIn) {
      this.requireLogin(targetUrl);
      return;
    }

    wx.navigateTo({
      url: targetUrl
    });
  },

  goResume() {
    if (!this.data.loggedIn) {
      this.requireLogin("/pages/room/room?resume=1");
      return;
    }

    wx.navigateTo({
      url: "/pages/room/room?resume=1"
    });
  },

  clearSession() {
    wx.removeStorageSync(SESSION_KEY);
    this.setData({ hasSession: false, sessionRoomId: "" });
    wx.showToast({ title: "会话已清空", icon: "none" });
  },

  openPrivacyPage() {
    wx.navigateTo({ url: "/pages/legal/privacy/privacy" });
  },

  openTermsPage() {
    wx.navigateTo({ url: "/pages/legal/terms/terms" });
  },

  async onWechatLogin() {
    if (this.data.loginBusy) {
      return;
    }

    if (!this.data.loginAgreementChecked) {
      wx.showToast({ title: "请先勾选协议", icon: "none" });
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
      const nextRedirectUrl = decodeRedirect(this.data.pendingRedirectUrl);
      const shouldStayOnLobby = !nextRedirectUrl || nextRedirectUrl === "/pages/lobby/lobby";
      persistLegalConsent();

      this.setData({
        nickname: profile.nickname || this.data.nickname,
        avatarUrl: profile.avatarUrl || this.data.avatarUrl,
        loggedIn: true,
        showLoginGate: false,
        loginAgreementChecked: false,
        loginHintText: shouldStayOnLobby ? "登录成功，现在可以直接组局" : "登录成功，正在进入...",
        pendingRedirectUrl: shouldStayOnLobby ? "/pages/lobby/lobby" : nextRedirectUrl,
        ...buildConnectionState()
      });
      syncLobbyTabBar(this);
      wx.showToast({ title: "登录成功", icon: "none" });

      if (!shouldStayOnLobby) {
        this.didAutoRoute = true;
        navigateAfterWechatLogin(nextRedirectUrl);
      }
    } catch (error) {
      const message = error && error.message ? String(error.message) : "微信登录失败";
      this.setData({ loginHintText: message });
      wx.showToast({ title: message, icon: "none" });
    } finally {
      this.setData({ loginBusy: false });
    }
  }
});
