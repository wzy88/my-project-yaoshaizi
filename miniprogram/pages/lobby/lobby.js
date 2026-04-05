const app = getApp();
const {
  SESSION_KEY,
  NICKNAME_KEY,
  WS_URL_KEY,
  CLOUD_ENV_ID_KEY,
  CLOUD_SERVICE_KEY,
  CLOUD_WS_PATH_KEY
} = require("../../utils/constants");
const { LOBBY_FLOAT_DICE_ASSETS, LOBBY_CREATE_DIE_ASSET } = require("../../utils/dice-assets");
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

function safeDecodeComponent(raw) {
  const value = String(raw || "");
  if (!value) return "";
  if (!/%[0-9a-fA-F]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
    timeText: "10:21",
    floatDiceAssets: LOBBY_FLOAT_DICE_ASSETS,
    createButtonDieAsset: LOBBY_CREATE_DIE_ASSET,
    nickname: "",
    avatarUrl: "",
    joinRoomId: "",
    loggedIn: false,
    showLoginGate: false,
    loginBusy: false,
    loginHintText: "点一下就能微信登录并继续组局",
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

    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) {
      tabBar.setData({ selected: 0 });
    }

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
    const fallbackNickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    const nickname = profile.nickname || fallbackNickname || "玩家";
    wx.setStorageSync(NICKNAME_KEY, nickname);

    const session = wx.getStorageSync(SESSION_KEY);
    const hasSession = Boolean(session && session.roomId && session.playerId && session.resumeToken);

    this.setData({
      timeText: buildTimeText(),
      nickname,
      avatarUrl: String(profile.avatarUrl || "").trim(),
      loggedIn: profile.loggedIn,
      showLoginGate: !profile.loggedIn,
      loginHintText: profile.loggedIn ? "已登录，现在可以直接组局" : "点一下就能微信登录并继续组局",
      hasSession,
      sessionRoomId: hasSession ? session.roomId : "",
      ...buildConnectionState(),
      ...extra
    });

    return profile;
  },

  requireLogin(redirectUrl = "/pages/lobby/lobby") {
    this.didAutoRoute = false;
    this.setData({
      showLoginGate: true,
      pendingRedirectUrl: decodeRedirect(redirectUrl),
      loginHintText: "点一下就能微信登录并继续组局",
      ...buildConnectionState()
    });
    return false;
  },

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
      const nextRedirectUrl = decodeRedirect(this.data.pendingRedirectUrl);
      const shouldStayOnLobby = !nextRedirectUrl || nextRedirectUrl === "/pages/lobby/lobby";

      this.setData({
        nickname: profile.nickname || this.data.nickname,
        avatarUrl: profile.avatarUrl || this.data.avatarUrl,
        loggedIn: true,
        showLoginGate: false,
        loginHintText: shouldStayOnLobby ? "登录成功，现在可以直接组局" : "登录成功，正在进入...",
        pendingRedirectUrl: shouldStayOnLobby ? "/pages/lobby/lobby" : nextRedirectUrl,
        ...buildConnectionState()
      });
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
