const { LEGAL_ACCEPT_KEY, SESSION_KEY, NICKNAME_KEY } = require("../../utils/constants");
const { LOBBY_FLOAT_DICE_ASSETS, LOBBY_CREATE_DIE_ASSET } = require("../../utils/dice-assets");

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

Page({
  data: {
    timeText: "10:21",
    floatDiceAssets: LOBBY_FLOAT_DICE_ASSETS,
    createButtonDieAsset: LOBBY_CREATE_DIE_ASSET,
    nickname: "",
    joinRoomId: "",
    legalAccepted: false,
    showLegalModal: false,
    hasSession: false,
    sessionRoomId: ""
  },

  onLoad() {
    const nickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    let finalNickname = nickname;
    if (!finalNickname) {
      finalNickname = `玩家${Math.floor(Math.random() * 1000)}`;
      wx.setStorageSync(NICKNAME_KEY, finalNickname);
    }

    const legalConsent = wx.getStorageSync(LEGAL_ACCEPT_KEY);
    const legalAccepted = Boolean(legalConsent && legalConsent.accepted === true);

    const session = wx.getStorageSync(SESSION_KEY);
    const hasSession = Boolean(session && session.roomId && session.playerId && session.resumeToken);

    this.setData({
      timeText: buildTimeText(),
      nickname: finalNickname,
      legalAccepted,
      showLegalModal: !legalAccepted,
      hasSession,
      sessionRoomId: hasSession ? session.roomId : ""
    });
  },

  onShow() {
    this.setData({ timeText: buildTimeText() });

    const latestNickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    if (latestNickname !== this.data.nickname) {
      this.setData({ nickname: latestNickname });
    }

    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) {
      tabBar.setData({ selected: 0 });
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
    this.setData({ nickname });
    wx.setStorageSync(NICKNAME_KEY, nickname);
  },

  onJoinRoomIdChange(event) {
    this.setData({ joinRoomId: String(event.detail.value || "").trim() });
  },

  ensureLegalThen(fn) {
    if (this.data.legalAccepted) {
      fn();
      return;
    }
    this.pendingNav = fn;
    this.setData({ showLegalModal: true });
  },

  goCreateRoom() {
    this.ensureLegalThen(() => {
      wx.navigateTo({
        url: `/pages/create-room/create-room?nickname=${encodeURIComponent(this.data.nickname || "")}`
      });
    });
  },

  async goJoinRoom() {
    if (!this.data.joinRoomId) {
      wx.showToast({ title: "请输入房间号", icon: "none" });
      return;
    }

    this.ensureLegalThen(async () => {
      const roomId = String(this.data.joinRoomId || "").trim();
      if (!/^\d{6}$/.test(roomId)) {
        wx.showToast({ title: "房间不存在或房间号有误", icon: "none", duration: 5000 });
        return;
      }

      wx.navigateTo({
        url: `/pages/room/room?mode=join&forceNew=1&roomId=${encodeURIComponent(roomId)}&nickname=${encodeURIComponent(this.data.nickname || "")}`
      });
    });
  },

  goResume() {
    this.ensureLegalThen(() => {
      wx.navigateTo({
        url: "/pages/room/room?resume=1"
      });
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

  acceptLegal() {
    wx.setStorageSync(LEGAL_ACCEPT_KEY, {
      accepted: true,
      version: "1.0.0",
      acceptedAt: Date.now()
    });
    this.setData({ legalAccepted: true, showLegalModal: false });
    const fn = this.pendingNav;
    this.pendingNav = null;
    if (fn) fn();
  },

  declineLegal() {
    wx.showToast({ title: "同意后方可继续使用", icon: "none" });
  }
});
