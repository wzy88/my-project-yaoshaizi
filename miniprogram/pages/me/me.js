const app = getApp();
const {
  SESSION_KEY,
  NICKNAME_KEY,
  PROFILE_NICKNAME_CUSTOMIZED_KEY,
  WECHAT_LOGIN_TS_KEY,
  SFX_ENABLED_KEY,
  TURN_ALERT_SFX_ENABLED_KEY,
  HAPTIC_ENABLED_KEY,
  CONTACT_EMAIL
} = require("../../utils/constants");
const {
  getStoredAccountSession,
  fetchMyAccountProfile,
  syncMyAccountProfile
} = require("../../utils/account-api");
const { validateNickname } = require("../../utils/nickname-validator");
const {
  getStoredWechatProfile,
  persistWechatProfile,
  persistLegalConsent,
  clearWechatProfile
} = require("../../utils/wechat-auth");
const { performWechatOneTapLogin, refreshWechatSessionSilently } = require("../../utils/wechat-login-flow");
const { LOBBY_FLOAT_DICE_ASSETS } = require("../../utils/dice-assets");

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

function readStoredBoolean(key, fallback = true) {
  const stored = wx.getStorageSync(key);
  return stored === "" || stored == null ? fallback : Boolean(stored);
}

function isAccountSessionExpiredMessage(message) {
  const normalized = String(message || "").trim().toLowerCase();
  return normalized.includes("账号登录已失效") || normalized.includes("unauthorized");
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
    floatDiceAssets: LOBBY_FLOAT_DICE_ASSETS,
    devtoolsMode: false,
    nickname: "",
    avatarUrl: "",
    initial: "玩",
    sfxEnabled: true,
    turnAlertSfxEnabled: true,
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
    sessionRoomId: "",
    contactEmail: CONTACT_EMAIL,
    nicknameSaving: false,
    showLoginGate: false,
    loginBusy: false,
    loginAgreementChecked: false,
    pendingSaveNickname: ""
  },

  onLoad() {
    const profile = getStoredWechatProfile();
    this.setData({
      devtoolsMode: Boolean(app && app.globalData && app.globalData.isDevtoolsMode),
      timeText: buildTimeText(),
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      initial: String(profile.nickname || "玩家").slice(0, 1),
      sfxEnabled: readStoredBoolean(SFX_ENABLED_KEY, true),
      turnAlertSfxEnabled: readStoredBoolean(TURN_ALERT_SFX_ENABLED_KEY, true),
      hapticEnabled: readStoredBoolean(HAPTIC_ENABLED_KEY, true),
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
    this.setData({
      timeText: buildTimeText(),
      sfxEnabled: readStoredBoolean(SFX_ENABLED_KEY, true),
      turnAlertSfxEnabled: readStoredBoolean(TURN_ALERT_SFX_ENABLED_KEY, true),
      hapticEnabled: readStoredBoolean(HAPTIC_ENABLED_KEY, true)
    });

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
    const nickname = String(event.detail.value || "");
    this.setData({
      nickname,
      initial: String(nickname || "玩家").slice(0, 1)
    });
  },

  onNicknameBlur(event) {
    const inputValue = String(event && event.detail && event.detail.value || this.data.nickname || "");
    const validation = validateNickname(inputValue);
    if (!validation.ok) {
      this.setData({
        nickname: inputValue,
        initial: String(inputValue || "玩家").slice(0, 1)
      });
      wx.showToast({ title: validation.message, icon: "none" });
      return;
    }

    this.setData({
      nickname: validation.value,
      initial: String(validation.value || "玩家").slice(0, 1)
    });
  },

  async onNicknameSave(event) {
    if (this.data.nicknameSaving) {
      return;
    }

    const inputValue = String(event && event.detail && event.detail.value || this.data.nickname || "");
    const validation = validateNickname(inputValue);
    if (!validation.ok) {
      this.setData({
        nickname: inputValue,
        initial: String(inputValue || "玩家").slice(0, 1)
      });
      wx.showToast({ title: validation.message, icon: "none" });
      return;
    }

    const session = getStoredAccountSession();
    if (!session.loggedIn) {
      this.setData({
        nickname: validation.value,
        initial: String(validation.value || "玩家").slice(0, 1),
        showLoginGate: true,
        loginBusy: false,
        loginAgreementChecked: false,
        pendingSaveNickname: validation.value
      });
      return;
    }

    this.setData({
      nickname: validation.value,
      initial: String(validation.value || "玩家").slice(0, 1),
      nicknameSaving: true
    });
    wx.setStorageSync(NICKNAME_KEY, validation.value);
    wx.setStorageSync(PROFILE_NICKNAME_CUSTOMIZED_KEY, true);

    try {
      const latest = await syncMyAccountProfile({
        nickname: validation.value,
        nicknameCustomized: true
      });
      const nextNickname = String(latest && latest.profile && latest.profile.nickname || validation.value).trim() || validation.value;
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
    } finally {
      this.setData({ nicknameSaving: false });
    }
  },

  closeLoginGate() {
    if (this.data.loginBusy) {
      return;
    }

    this.setData({
      showLoginGate: false,
      loginBusy: false,
      loginAgreementChecked: false,
      pendingSaveNickname: ""
    });
  },

  toggleLoginAgreement() {
    this.setData({
      loginAgreementChecked: !this.data.loginAgreementChecked
    });
  },

  noop() {},

  async onLoginAndSaveNickname() {
    if (this.data.loginBusy) {
      return;
    }

    if (!this.data.loginAgreementChecked) {
      wx.showToast({ title: "请先勾选协议", icon: "none" });
      return;
    }

    const pendingNickname = String(this.data.pendingSaveNickname || this.data.nickname || "").trim();
    const validation = validateNickname(pendingNickname);
    if (!validation.ok) {
      wx.showToast({ title: validation.message, icon: "none" });
      return;
    }

    this.setData({
      nickname: validation.value,
      initial: String(validation.value || "玩家").slice(0, 1),
      loginBusy: true
    });
    wx.setStorageSync(NICKNAME_KEY, validation.value);
    wx.setStorageSync(PROFILE_NICKNAME_CUSTOMIZED_KEY, true);

    try {
      persistWechatProfile({
        nickname: validation.value,
        avatarUrl: this.data.avatarUrl,
        nicknameCustomized: true
      });
      persistLegalConsent();
      const loginResult = await performWechatOneTapLogin();
      const loggedProfile = loginResult && loginResult.profile ? loginResult.profile : getStoredWechatProfile();
      const loggedSession = loginResult && loginResult.accountSession ? loginResult.accountSession : getStoredAccountSession();
      this.setData({
        nickname: loggedProfile.nickname || validation.value,
        avatarUrl: loggedProfile.avatarUrl || this.data.avatarUrl,
        initial: String((loggedProfile.nickname || validation.value || "玩家")).slice(0, 1),
        showLoginGate: false,
        loginBusy: false,
        loginAgreementChecked: false,
        pendingSaveNickname: "",
        ...buildAccountData(loggedSession)
      });
      wx.showToast({ title: "登录成功，昵称已保存", icon: "none" });
      void this.refreshAccountProfile();
    } catch (error) {
      const message = error && error.message ? String(error.message) : "登录失败，请稍后再试";
      this.setData({ loginBusy: false });
      wx.showToast({ title: message, icon: "none" });
    }
  },

  onToggleSfx() {
    const next = !this.data.sfxEnabled;
    this.setData({ sfxEnabled: next });
    wx.setStorageSync(SFX_ENABLED_KEY, next);
  },

  onToggleTurnAlertSfx() {
    const next = !this.data.turnAlertSfxEnabled;
    this.setData({ turnAlertSfxEnabled: next });
    wx.setStorageSync(TURN_ALERT_SFX_ENABLED_KEY, next);
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
      const message = error && error.message ? String(error.message) : "账号信息同步失败";
      if (isAccountSessionExpiredMessage(message)) {
        try {
          await refreshWechatSessionSilently();
          return await this.refreshAccountProfile();
        } catch (refreshError) {
          const localProfile = getStoredWechatProfile();
          this.setData({
            nickname: localProfile.nickname,
            avatarUrl: localProfile.avatarUrl,
            initial: String(localProfile.nickname || "玩家").slice(0, 1),
            ...buildAccountData(getStoredAccountSession()),
            accountLoading: false
          });
        }
        return;
      }

      this.setData({ accountLoading: false });
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
  },

  copyContactEmail() {
    wx.setClipboardData({
      data: CONTACT_EMAIL,
      success: () => {
        wx.showToast({ title: "邮箱已复制", icon: "none" });
      },
      fail: () => {
        wx.showToast({ title: CONTACT_EMAIL, icon: "none" });
      }
    });
  }
});
