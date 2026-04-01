const app = getApp();
const {
  WS_URL_KEY,
  CLOUD_ENV_ID_KEY,
  CLOUD_SERVICE_KEY,
  CLOUD_WS_PATH_KEY,
  SESSION_KEY,
  NICKNAME_KEY,
  AVATAR_URL_KEY,
  SFX_ENABLED_KEY,
  HAPTIC_ENABLED_KEY
} = require("../../utils/constants");
const {
  DEFAULT_CONTAINER_WS_PATH,
  normalizeContainerConfig,
  hasContainerService,
  buildContainerSummary,
  canUseCloudSocketApi,
  initMiniProgramCloud
} = require("../../utils/cloud-container");
const { isDevtoolsPlatform } = require("../../utils/system-info");

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

function buildWsHint(options, lastWsError = "") {
  const params = options && typeof options === "object"
    ? options
    : { wsUrl: options };
  const wsUrl = params.wsUrl;
  const containerConfig = normalizeContainerConfig(params.containerConfig);
  const url = String(wsUrl || "").trim();
  const err = String(lastWsError || "");
  if (hasContainerService(containerConfig)) {
    const summary = buildContainerSummary(containerConfig);
    if (!canUseCloudSocketApi()) {
      return "当前微信版本不支持云托管连接，请升级微信或开发者工具";
    }
    if (err.includes("1006")) return "云托管握手失败，请确认服务名和路径是否正确";
    if (err.includes("connectContainer")) return `云托管连接失败：${err}`;
    return `当前优先走微信云托管：${summary}`;
  }
  if (!url) return "请先填写服务器地址";
  if (!/^wss?:\/\//i.test(url)) return "地址格式不正确，请使用 ws:// 或 wss://";
  const matched = url.match(/^wss?:\/\/([^/:?#]+)/i);
  const host = matched ? matched[1].toLowerCase() : "";
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    return "手机真机无法访问 127.0.0.1，请改成电脑局域网 IP（如 ws://192.168.1.23:3000/ws）";
  }
  if (err.includes("1006")) return "1006 通常是握手或证书问题；请优先使用 wss:// 公网域名";
  if (/^ws:\/\//i.test(url)) return "真机预览建议使用 wss://；局域网联调请确保同一 Wi‑Fi";
  return "地址末尾建议包含 /ws（如 ws://x.x.x.x:3000/ws）";
}

function buildTimeText() {
  const date = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

Page({
  data: {
    timeText: "10:21",
    wsUrl: app.globalData.wsUrl,
    containerEnvId: app.globalData.containerConfig ? app.globalData.containerConfig.envId : "",
    containerService: app.globalData.containerConfig ? app.globalData.containerConfig.service : "",
    containerWsPath: app.globalData.containerConfig ? app.globalData.containerConfig.wsPath : DEFAULT_CONTAINER_WS_PATH,
    connectionSummaryText: buildContainerSummary(app.globalData.containerConfig || {}),
    wsHintText: "",
    lastWsError: "",
    nickname: "",
    avatarUrl: "",
    initial: "玩",
    sfxEnabled: true,
    hapticEnabled: true,
    devtoolsMode: false,
    hasSession: false,
    sessionRoomId: ""
  },

  onLoad() {
    const cachedWsUrl = wx.getStorageSync(WS_URL_KEY);
    if (cachedWsUrl && typeof cachedWsUrl === "string") {
      const trimmed = cachedWsUrl.trim();
      this.setData({ wsUrl: trimmed });
      app.globalData.wsUrl = trimmed;
    }

    const containerConfig = normalizeContainerConfig({
      envId: wx.getStorageSync(CLOUD_ENV_ID_KEY),
      service: wx.getStorageSync(CLOUD_SERVICE_KEY),
      wsPath: wx.getStorageSync(CLOUD_WS_PATH_KEY)
    });
    this.setData({
      containerEnvId: containerConfig.envId,
      containerService: containerConfig.service,
      containerWsPath: containerConfig.wsPath,
      connectionSummaryText: buildContainerSummary(containerConfig)
    });
    app.globalData.containerConfig = containerConfig;

    const nickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    let finalNickname = nickname;
    if (!finalNickname) {
      finalNickname = `玩家${Math.floor(Math.random() * 1000)}`;
      wx.setStorageSync(NICKNAME_KEY, finalNickname);
    }
    const avatarUrl = String(wx.getStorageSync(AVATAR_URL_KEY) || "").trim();
    const storedSfx = wx.getStorageSync(SFX_ENABLED_KEY);
    const storedHaptic = wx.getStorageSync(HAPTIC_ENABLED_KEY);
    const sfxEnabled = storedSfx === "" || storedSfx == null ? true : Boolean(storedSfx);
    const hapticEnabled = storedHaptic === "" || storedHaptic == null ? true : Boolean(storedHaptic);
    this.setData({
      timeText: buildTimeText(),
      nickname: finalNickname,
      avatarUrl,
      initial: String(finalNickname || "玩家").slice(0, 1),
      sfxEnabled,
      hapticEnabled,
      devtoolsMode: Boolean(app.globalData.isDevtoolsMode || isDevtoolsPlatform()),
      wsHintText: buildWsHint({
        wsUrl: this.data.wsUrl,
        containerConfig
      }, ""),
    });

    const session = wx.getStorageSync(SESSION_KEY);
    const hasSession = Boolean(session && session.roomId && session.playerId && session.resumeToken);
    this.setData({
      hasSession,
      sessionRoomId: hasSession ? session.roomId : ""
    });
  },

  onShow() {
    this.setData({ timeText: buildTimeText() });

    const latestNickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    if (latestNickname !== this.data.nickname) {
      this.setData({
        nickname: latestNickname,
        initial: String(latestNickname || "玩家").slice(0, 1)
      });
    }

    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) {
      tabBar.setData({ selected: 2 });
    }

    const session = wx.getStorageSync(SESSION_KEY);
    const hasSession = Boolean(session && session.roomId && session.playerId && session.resumeToken);
    if (hasSession !== this.data.hasSession) {
      this.setData({
        hasSession,
        sessionRoomId: hasSession ? session.roomId : ""
      });
    }
  },

  onNicknameChange(event) {
    const nickname = String(event.detail.value || "").trim();
    this.setData({
      nickname,
      initial: String(nickname || "玩家").slice(0, 1)
    });
    wx.setStorageSync(NICKNAME_KEY, nickname);
  },

  syncWeChatProfile() {
    if (!wx.getUserProfile) {
      wx.showToast({ title: "当前基础库不支持", icon: "none" });
      return;
    }

    wx.getUserProfile({
      desc: "用于展示头像与昵称（可选）",
      success: (res) => {
        const userInfo = res && res.userInfo ? res.userInfo : {};
        const avatarUrl = String(userInfo.avatarUrl || "").trim();
        const nickName = String(userInfo.nickName || "").trim();
        if (avatarUrl) {
          wx.setStorageSync(AVATAR_URL_KEY, avatarUrl);
        }
        if (nickName) {
          wx.setStorageSync(NICKNAME_KEY, nickName);
        }
        this.setData({
          avatarUrl: avatarUrl || this.data.avatarUrl,
          nickname: nickName || this.data.nickname,
          initial: String(nickName || this.data.nickname || "玩家").slice(0, 1)
        });
        wx.showToast({ title: "已同步", icon: "none" });
      },
      fail: () => {
        wx.showToast({ title: "未授权", icon: "none" });
      }
    });
  },

  onToggleSfx() {
    const next = !this.data.sfxEnabled;
    this.setData({ sfxEnabled: next });
    wx.setStorageSync(SFX_ENABLED_KEY, next);
  },

  onToggleHaptic() {
    const next = !this.data.hapticEnabled;
    this.setData({ hapticEnabled: next });
    wx.setStorageSync(HAPTIC_ENABLED_KEY, next);
  },

  openWsConfig() {
    wx.showModal({
      title: "云托管服务名",
      editable: true,
      placeholderText: "例如 express-rw1k",
      content: this.data.containerService || "",
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
          content: this.data.containerEnvId || "",
          success: (envRes) => {
            if (!envRes.confirm) return;

            const nextEnvId = String(envRes.content || "").trim();
            wx.showModal({
              title: "WebSocket 路径",
              editable: true,
              placeholderText: "/ws",
              content: this.data.containerWsPath || DEFAULT_CONTAINER_WS_PATH,
              success: (pathRes) => {
                if (!pathRes.confirm) return;

                const nextConfig = normalizeContainerConfig({
                  envId: nextEnvId,
                  service: nextService,
                  wsPath: pathRes.content
                });
                const initResult = initMiniProgramCloud(nextConfig);

                this.setData({
                  containerEnvId: nextConfig.envId,
                  containerService: nextConfig.service,
                  containerWsPath: nextConfig.wsPath,
                  connectionSummaryText: buildContainerSummary(nextConfig),
                  wsHintText: buildWsHint({
                    wsUrl: this.data.wsUrl,
                    containerConfig: nextConfig
                  }, ""),
                  lastWsError: ""
                });

                app.globalData.containerConfig = nextConfig;
                wx.setStorageSync(CLOUD_ENV_ID_KEY, nextConfig.envId);
                wx.setStorageSync(CLOUD_SERVICE_KEY, nextConfig.service);
                wx.setStorageSync(CLOUD_WS_PATH_KEY, nextConfig.wsPath);

                wx.showToast({
                  title: initResult.ok ? "云托管配置已保存" : "已保存，初始化待真机验证",
                  icon: "none"
                });
              }
            });
          }
        });
      }
    });
  },

  goRules() {
    wx.navigateTo({ url: "/pages/rules/rules" });
  },

  goResume() {
    wx.navigateTo({ url: "/pages/room/room?resume=1" });
  },

  clearSession() {
    wx.removeStorageSync(SESSION_KEY);
    this.setData({ hasSession: false, sessionRoomId: "" });
    wx.showToast({ title: "会话已清空", icon: "none" });
  },

  logoutProfile() {
    wx.removeStorageSync(SESSION_KEY);
    wx.removeStorageSync(AVATAR_URL_KEY);
    this.setData({
      avatarUrl: "",
      hasSession: false,
      sessionRoomId: ""
    });
    wx.showToast({ title: "已退出当前资料", icon: "none" });
  },

  openPrivacyPage() {
    wx.navigateTo({ url: "/pages/legal/privacy/privacy" });
  },

  openTermsPage() {
    wx.navigateTo({ url: "/pages/legal/terms/terms" });
  }
});
