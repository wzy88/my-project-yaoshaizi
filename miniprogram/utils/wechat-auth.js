const {
  LEGAL_ACCEPT_KEY,
  NICKNAME_KEY,
  AVATAR_URL_KEY,
  PROFILE_SEED_KEY,
  PROFILE_NICKNAME_CUSTOMIZED_KEY,
  WECHAT_LOGIN_TS_KEY
} = require("./constants");
const { getStoredAccountSession, clearAccountSession } = require("./account-api");
const {
  buildDefaultNickname,
  ensureProfileDefaults,
  createRandomProfileDefaults,
  looksLikeGeneratedNickname,
  pickDefaultAvatar
} = require("./profile-defaults");

const TAB_BAR_PAGES = new Set([
  "/pages/lobby/lobby",
  "/pages/me/me"
]);

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

function getStoredProfileSeed() {
  return String(wx.getStorageSync(PROFILE_SEED_KEY) || "").trim();
}

function ensureProfileSeed(options = {}) {
  const invalidSeeds = Array.isArray(options.invalidSeeds)
    ? options.invalidSeeds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const current = getStoredProfileSeed();
  if (current && !invalidSeeds.includes(current)) {
    return current;
  }

  const nextSeed = String(options.preferredSeed || "").trim() || createRandomProfileDefaults().seed;
  wx.setStorageSync(PROFILE_SEED_KEY, nextSeed);
  return nextSeed;
}

function getStoredNicknameCustomized() {
  const raw = wx.getStorageSync(PROFILE_NICKNAME_CUSTOMIZED_KEY);
  if (raw === "" || raw == null) {
    return undefined;
  }
  return Boolean(raw);
}

function inferNicknameCustomized(nickname, seed, explicitFlag) {
  const normalized = safeDecodeComponent(nickname).trim();
  if (!normalized) {
    return false;
  }

  if (explicitFlag === true) {
    return true;
  }

  if (explicitFlag === false) {
    return false;
  }

  if (normalized === buildDefaultNickname(seed)) {
    return false;
  }

  return !looksLikeGeneratedNickname(normalized);
}

function syncStoredProfileCache(profile, loginAt = 0, options = {}) {
  const seed = ensureProfileSeed({
    preferredSeed: options.seed,
    invalidSeeds: options.invalidSeeds
  });
  const nicknameCustomized = inferNicknameCustomized(
    profile && profile.nickname,
    seed,
    profile && profile.nicknameCustomized
  );
  const normalized = ensureProfileDefaults({
    ...(profile && typeof profile === "object" ? profile : {}),
    nickname: nicknameCustomized ? safeDecodeComponent(profile && profile.nickname).trim() : "",
    avatarUrl: pickDefaultAvatar(seed),
    seed,
    nicknameCustomized
  }, {
    seed
  });

  wx.setStorageSync(NICKNAME_KEY, normalized.nickname);
  wx.setStorageSync(AVATAR_URL_KEY, normalized.avatarUrl);
  wx.setStorageSync(PROFILE_NICKNAME_CUSTOMIZED_KEY, nicknameCustomized);
  if (Number(loginAt) > 0) {
    wx.setStorageSync(WECHAT_LOGIN_TS_KEY, Number(loginAt));
  }

  return {
    ...normalized,
    nicknameCustomized
  };
}

function getStoredWechatProfile() {
  const accountSession = getStoredAccountSession();
  const accountProfile = accountSession.profile && typeof accountSession.profile === "object"
    ? accountSession.profile
    : {};
  const accountId = String(accountSession.accountId || accountProfile.accountId || "").trim();
  const displayId = String(accountSession.displayId || accountProfile.displayId || "").trim();
  const loginAt = Number(wx.getStorageSync(WECHAT_LOGIN_TS_KEY) || accountSession.loginAt || 0);
  const seed = ensureProfileSeed({
    invalidSeeds: [accountId, displayId]
  });
  const storedNickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
  const accountNickname = safeDecodeComponent(accountProfile.nickname).trim();
  const accountNicknameCustomized = inferNicknameCustomized(
    accountNickname,
    seed,
    accountProfile.nicknameCustomized
  );
  const storedNicknameCustomized = inferNicknameCustomized(
    storedNickname,
    seed,
    getStoredNicknameCustomized()
  );
  const normalized = syncStoredProfileCache({
    nickname: accountNicknameCustomized
      ? accountNickname
      : (storedNicknameCustomized ? storedNickname : ""),
    accountId,
    displayId,
    seed,
    nicknameCustomized: accountNicknameCustomized || storedNicknameCustomized
  }, loginAt, {
    seed,
    invalidSeeds: [accountId, displayId]
  });

  return {
    nickname: normalized.nickname,
    avatarUrl: normalized.avatarUrl,
    nicknameCustomized: normalized.nicknameCustomized,
    loginAt,
    accountId: accountSession.accountId,
    accountDisplayId: accountSession.displayId,
    accountProfile: accountSession.profile,
    loggedIn: Boolean(loginAt > 0 && accountSession.loggedIn)
  };
}

function requestWechatLogin() {
  return new Promise((resolve, reject) => {
    if (!wx.login || typeof wx.login !== "function") {
      reject(new Error("当前微信版本不支持登录"));
      return;
    }

    wx.login({
      timeout: 8000,
      success: (res) => {
        if (res && res.code) {
          resolve({
            code: res.code,
            loginAt: Date.now()
          });
          return;
        }
        reject(new Error("未获取到登录凭证"));
      },
      fail: (error) => {
        const message = error && error.errMsg ? error.errMsg : "微信登录失败";
        reject(new Error(message));
      }
    });
  });
}

function requestWechatUserProfile() {
  const stored = getStoredWechatProfile();
  return Promise.resolve({
    nickname: stored.nickname,
    avatarUrl: stored.avatarUrl,
    nicknameCustomized: Boolean(stored.nicknameCustomized)
  });
}

function persistWechatProfile(profile) {
  const nextLoginAt = Number(profile && profile.loginAt) || Date.now();
  const accountId = String(profile && profile.accountId || "").trim();
  const displayId = String(profile && profile.displayId || "").trim();
  const seed = ensureProfileSeed({
    invalidSeeds: [accountId, displayId]
  });
  const normalized = syncStoredProfileCache({
    nickname: safeDecodeComponent(profile && profile.nickname).trim(),
    accountId,
    displayId,
    nicknameCustomized: inferNicknameCustomized(
      profile && profile.nickname,
      seed,
      profile && profile.nicknameCustomized
    )
  }, nextLoginAt, {
    seed,
    invalidSeeds: [accountId, displayId]
  });

  return {
    nickname: normalized.nickname,
    avatarUrl: normalized.avatarUrl,
    nicknameCustomized: normalized.nicknameCustomized,
    loginAt: nextLoginAt,
    loggedIn: true
  };
}

function persistLegalConsent() {
  const payload = {
    accepted: true,
    version: "1.0.0",
    acceptedAt: Date.now()
  };
  wx.setStorageSync(LEGAL_ACCEPT_KEY, payload);
  return payload;
}

function clearWechatProfile() {
  wx.removeStorageSync(NICKNAME_KEY);
  wx.removeStorageSync(AVATAR_URL_KEY);
  wx.removeStorageSync(PROFILE_SEED_KEY);
  wx.removeStorageSync(PROFILE_NICKNAME_CUSTOMIZED_KEY);
  wx.removeStorageSync(WECHAT_LOGIN_TS_KEY);
  wx.removeStorageSync(LEGAL_ACCEPT_KEY);
  clearAccountSession();
}

function persistChosenAvatar(tempFilePath) {
  const source = String(tempFilePath || "").trim();
  if (!source) {
    return Promise.resolve("");
  }

  if (!wx.saveFile || typeof wx.saveFile !== "function" || !/^wxfile:\/\//i.test(source)) {
    return Promise.resolve(source);
  }

  return new Promise((resolve) => {
    wx.saveFile({
      tempFilePath: source,
      success: (res) => {
        resolve(String(res && res.savedFilePath || source));
      },
      fail: () => {
        resolve(source);
      }
    });
  });
}

function buildLoginRedirectUrl(targetUrl) {
  const safeTarget = String(targetUrl || "").trim() || "/pages/lobby/lobby";
  return `/pages/lobby/lobby?redirect=${encodeURIComponent(safeTarget)}`;
}

function navigateAfterWechatLogin(targetUrl) {
  const nextUrl = String(targetUrl || "").trim() || "/pages/lobby/lobby";
  const nextPath = nextUrl.split("?")[0];

  if (TAB_BAR_PAGES.has(nextPath)) {
    wx.switchTab({ url: nextPath });
    return;
  }

  wx.redirectTo({ url: nextUrl });
}

module.exports = {
  safeDecodeComponent,
  getStoredWechatProfile,
  requestWechatLogin,
  requestWechatUserProfile,
  persistWechatProfile,
  persistLegalConsent,
  clearWechatProfile,
  persistChosenAvatar,
  buildLoginRedirectUrl,
  navigateAfterWechatLogin
};
