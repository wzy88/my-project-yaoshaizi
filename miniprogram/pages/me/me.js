const app = getApp();
const {
  WS_URL_KEY,
  SESSION_KEY,
  NICKNAME_KEY,
  AVATAR_URL_KEY,
  SFX_ENABLED_KEY,
  HAPTIC_ENABLED_KEY
} = require("../../utils/constants");

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

function buildWsHint(wsUrl, lastWsError = "") {
  const url = String(wsUrl || "").trim();
  const err = String(lastWsError || "");
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

function isDevtoolsPlatform() {
  try {
    const info = wx.getSystemInfoSync();
    return Boolean(info && info.platform === "devtools");
  } catch {
    return false;
  }
}

Page({
  data: {
    timeText: "10:21",
    wsUrl: app.globalData.wsUrl,
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
      wsHintText: buildWsHint(this.data.wsUrl, ""),
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
      title: "设置服务器地址",
      editable: true,
      placeholderText: "ws://192.168.1.23:3000/ws",
      content: this.data.wsUrl || "",
      success: (res) => {
        if (!res.confirm) return;
        const nextUrl = String(res.content || "").trim();
        if (!/^wss?:\/\/.+/i.test(nextUrl)) {
          wx.showToast({ title: "地址格式错误", icon: "none" });
          return;
        }
        this.setData({
          wsUrl: nextUrl,
          wsHintText: buildWsHint(nextUrl, ""),
          lastWsError: ""
        });
        app.globalData.wsUrl = nextUrl;
        wx.setStorageSync(WS_URL_KEY, nextUrl);
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
