const {
  LEGAL_ACCEPT_KEY,
  NICKNAME_KEY,
  AVATAR_URL_KEY,
  WECHAT_LOGIN_TS_KEY
} = require("./constants");
const { getStoredAccountSession, clearAccountSession } = require("./account-api");

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

function getStoredWechatProfile() {
  const nickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
  const avatarUrl = String(wx.getStorageSync(AVATAR_URL_KEY) || "").trim();
  const loginAt = Number(wx.getStorageSync(WECHAT_LOGIN_TS_KEY) || 0);
  const accountSession = getStoredAccountSession();

  return {
    nickname,
    avatarUrl,
    loginAt,
    accountId: accountSession.accountId,
    accountDisplayId: accountSession.displayId,
    accountProfile: accountSession.profile,
    loggedIn: Boolean(nickname && avatarUrl && loginAt > 0 && accountSession.loggedIn)
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

function normalizeWechatUserInfo(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    nickname: safeDecodeComponent(source.nickName || source.nickname).trim(),
    avatarUrl: String(source.avatarUrl || "").trim()
  };
}

function requestWechatUserProfile() {
  const stored = getStoredWechatProfile();
  return new Promise((resolve, reject) => {
    if (!wx.getUserProfile || typeof wx.getUserProfile !== "function") {
      if (stored.nickname && stored.avatarUrl) {
        resolve({
          nickname: stored.nickname,
          avatarUrl: stored.avatarUrl
        });
        return;
      }
      reject(new Error("当前微信版本不支持获取微信头像昵称"));
      return;
    }

    wx.getUserProfile({
      desc: "用于完成微信登录并展示头像昵称",
      success: (res) => {
        const userInfo = normalizeWechatUserInfo(res && res.userInfo);
        if (userInfo.nickname && userInfo.avatarUrl) {
          resolve(userInfo);
          return;
        }
        reject(new Error("未获取到微信头像昵称"));
      },
      fail: (error) => {
        const errMsg = String(error && error.errMsg || "");
        if (stored.nickname && stored.avatarUrl) {
          resolve({
            nickname: stored.nickname,
            avatarUrl: stored.avatarUrl
          });
          return;
        }
        if (errMsg.includes("deny")) {
          reject(new Error("需要授权微信头像昵称后继续"));
          return;
        }
        reject(new Error(errMsg || "获取微信资料失败"));
      }
    });
  });
}

function persistWechatProfile(profile) {
  const nextNickname = safeDecodeComponent(profile && profile.nickname).trim();
  const nextAvatarUrl = String(profile && profile.avatarUrl || "").trim();
  const nextLoginAt = Number(profile && profile.loginAt) || Date.now();

  if (!nextNickname || !nextAvatarUrl) {
    throw new Error("缺少头像或昵称");
  }

  wx.setStorageSync(NICKNAME_KEY, nextNickname);
  wx.setStorageSync(AVATAR_URL_KEY, nextAvatarUrl);
  wx.setStorageSync(WECHAT_LOGIN_TS_KEY, nextLoginAt);

  return {
    nickname: nextNickname,
    avatarUrl: nextAvatarUrl,
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
