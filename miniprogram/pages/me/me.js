const {
  SESSION_KEY,
  NICKNAME_KEY,
  PROFILE_NICKNAME_CUSTOMIZED_KEY,
  WECHAT_LOGIN_TS_KEY,
  SFX_ENABLED_KEY,
  HAPTIC_ENABLED_KEY
} = require("../../utils/constants");
const {
  getStoredAccountSession,
  fetchMyAccountProfile,
  syncMyAccountProfile
} = require("../../utils/account-api");
const {
  getStoredWechatProfile,
  persistWechatProfile,
  clearWechatProfile
} = require("../../utils/wechat-auth");

function buildTimeText() {
  const date = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatShortDateTime(ts) {
  const value = Number(ts) || 0;
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hh}:${mm}`;
}

function buildAccountData(session) {
  const normalized = session && typeof session === "object" ? session : {};
  const profile = normalized.profile && typeof normalized.profile === "object" ? normalized.profile : {};
  const stats = profile.stats && typeof profile.stats === "object" ? profile.stats : {};
  const totalRounds = Number(stats.totalRounds) || 0;
  const roundsWon = Number(stats.roundsWon) || 0;
  const roundsLost = Number(stats.roundsLost) || 0;
  const roomsCreated = Number(stats.roomsCreated) || 0;
  const roomsJoined = Number(stats.roomsJoined) || 0;
  const totalOpenRequests = Number(stats.totalOpenRequests) || 0;
  const totalCallsMade = Number(stats.totalCallsMade) || 0;
  const winRate = totalRounds > 0 ? `${Math.round((roundsWon / totalRounds) * 100)}%` : "0%";

  return {
    accountDisplayId: String(profile.displayId || normalized.displayId || "").trim(),
    accountReady: Boolean(normalized.loggedIn),
    totalRounds,
    roundsWon,
    roundsLost,
    roomsCreated,
    roomsJoined,
    totalOpenRequests,
    totalCallsMade,
    winRate,
    lastRoundText: formatShortDateTime(stats.lastRoundAt)
  };
}

Page({
  data: {
    timeText: "10:21",
    nickname: "",
    avatarUrl: "",
    initial: "玩",
    sfxEnabled: true,
    hapticEnabled: true,
    accountDisplayId: "",
    accountReady: false,
    accountLoading: false,
    totalRounds: 0,
    roundsWon: 0,
    roundsLost: 0,
    roomsCreated: 0,
    roomsJoined: 0,
    totalOpenRequests: 0,
    totalCallsMade: 0,
    winRate: "0%",
    lastRoundText: "暂无",
    hasSession: false,
    sessionRoomId: ""
  },

  onLoad() {
    const profile = getStoredWechatProfile();
    const storedSfx = wx.getStorageSync(SFX_ENABLED_KEY);
    const storedHaptic = wx.getStorageSync(HAPTIC_ENABLED_KEY);
    const sfxEnabled = storedSfx === "" || storedSfx == null ? true : Boolean(storedSfx);
    const hapticEnabled = storedHaptic === "" || storedHaptic == null ? true : Boolean(storedHaptic);
    this.setData({
      timeText: buildTimeText(),
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      initial: String(profile.nickname || "玩家").slice(0, 1),
      sfxEnabled,
      hapticEnabled,
      ...buildAccountData(getStoredAccountSession())
    });

    const session = wx.getStorageSync(SESSION_KEY);
    const hasSession = Boolean(session && session.roomId && session.playerId && session.resumeToken);
    this.setData({
      hasSession,
      sessionRoomId: hasSession ? session.roomId : ""
    });

    void this.refreshAccountProfile();
  },

  onShow() {
    this.setData({ timeText: buildTimeText() });

    const profile = getStoredWechatProfile();
    if (profile.nickname !== this.data.nickname || profile.avatarUrl !== this.data.avatarUrl) {
      this.setData({
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        initial: String(profile.nickname || "玩家").slice(0, 1)
      });
    }

    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) {
      tabBar.setData({ selected: 1, hidden: false });
    }

    const session = wx.getStorageSync(SESSION_KEY);
    const hasSession = Boolean(session && session.roomId && session.playerId && session.resumeToken);
    if (hasSession !== this.data.hasSession) {
      this.setData({
        hasSession,
        sessionRoomId: hasSession ? session.roomId : ""
      });
    }

    this.setData(buildAccountData(getStoredAccountSession()));
    void this.refreshAccountProfile();
  },

  onNicknameChange(event) {
    const nickname = String(event.detail.value || "").trim();
    this.setData({
      nickname,
      initial: String(nickname || "玩家").slice(0, 1)
    });
    wx.setStorageSync(NICKNAME_KEY, nickname);
    wx.setStorageSync(PROFILE_NICKNAME_CUSTOMIZED_KEY, Boolean(nickname));
  },

  async onNicknameCommit(event) {
    const inputValue = String(event && event.detail && event.detail.value || this.data.nickname || "").trim();
    if (!inputValue) {
      wx.showToast({ title: "昵称不能为空", icon: "none" });
      return;
    }

    this.setData({
      nickname: inputValue,
      initial: String(inputValue || "玩家").slice(0, 1)
    });
    wx.setStorageSync(NICKNAME_KEY, inputValue);
    wx.setStorageSync(PROFILE_NICKNAME_CUSTOMIZED_KEY, true);

    const session = getStoredAccountSession();
    if (!session.loggedIn) {
      return;
    }

    try {
      const latest = await syncMyAccountProfile({
        nickname: inputValue,
        nicknameCustomized: true
      });
      const nextNickname = String(latest && latest.profile && latest.profile.nickname || inputValue).trim() || inputValue;
      wx.setStorageSync(NICKNAME_KEY, nextNickname);
      this.setData({
        nickname: nextNickname,
        initial: String(nextNickname || "玩家").slice(0, 1),
        ...buildAccountData(latest)
      });
      wx.showToast({ title: "昵称已保存", icon: "none" });
    } catch (error) {
      const message = error && error.message ? String(error.message) : "昵称同步失败";
      wx.showToast({ title: message, icon: "none" });
    }
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

  async refreshAccountProfile() {
    const session = getStoredAccountSession();
    this.setData({
      ...buildAccountData(session),
      accountLoading: session.loggedIn
    });

    if (!session.loggedIn) {
      this.setData({ accountLoading: false });
      return;
    }

    try {
      const latest = await fetchMyAccountProfile();
      const syncedProfile = persistWechatProfile({
        nickname: latest && latest.profile && latest.profile.nickname,
        avatarUrl: latest && latest.profile && latest.profile.avatarUrl,
        loginAt: Number(wx.getStorageSync(WECHAT_LOGIN_TS_KEY)) || latest && latest.loginAt || Date.now()
      });
      this.setData({
        nickname: syncedProfile.nickname,
        avatarUrl: syncedProfile.avatarUrl,
        initial: String(syncedProfile.nickname || "玩家").slice(0, 1),
        ...buildAccountData(latest),
        accountLoading: false
      });
    } catch (error) {
      this.setData({ accountLoading: false });
      const message = error && error.message ? String(error.message) : "账号信息同步失败";
      wx.showToast({ title: message, icon: "none" });
    }
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
    clearWechatProfile();
    this.setData({
      nickname: "",
      initial: "玩",
      avatarUrl: "",
      ...buildAccountData({}),
      hasSession: false,
      sessionRoomId: ""
    });
    wx.reLaunch({ url: "/pages/lobby/lobby" });
  },

  openPrivacyPage() {
    wx.navigateTo({ url: "/pages/legal/privacy/privacy" });
  },

  openTermsPage() {
    wx.navigateTo({ url: "/pages/legal/terms/terms" });
  }
});
