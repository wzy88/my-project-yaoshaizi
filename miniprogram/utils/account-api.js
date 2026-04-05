const { ACCOUNT_SESSION_KEY } = require("./constants");
const { requestBackend } = require("./backend-request");

function normalizeStoredSession(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const profile = source.profile && typeof source.profile === "object" ? source.profile : {};
  const sessionToken = String(source.sessionToken || "").trim();
  const accountId = String(profile.accountId || source.accountId || "").trim();
  const displayId = String(profile.displayId || source.displayId || "").trim();

  return {
    accountId,
    displayId,
    sessionToken,
    loginAt: Number(source.loginAt) || 0,
    authMode: String(source.authMode || "").trim() || "wechat",
    profile,
    loggedIn: Boolean(accountId && displayId && sessionToken)
  };
}

function getStoredAccountSession() {
  if (!globalThis.wx || typeof globalThis.wx.getStorageSync !== "function") {
    return normalizeStoredSession(null);
  }

  const raw = globalThis.wx.getStorageSync(ACCOUNT_SESSION_KEY);
  return normalizeStoredSession(raw);
}

function persistAccountSession(result) {
  const normalized = normalizeStoredSession(result);
  if (!normalized.loggedIn) {
    throw new Error("缺少账号会话信息");
  }

  globalThis.wx.setStorageSync(ACCOUNT_SESSION_KEY, {
    accountId: normalized.accountId,
    displayId: normalized.displayId,
    sessionToken: normalized.sessionToken,
    loginAt: normalized.loginAt,
    authMode: normalized.authMode,
    profile: normalized.profile
  });

  return normalized;
}

function clearAccountSession() {
  if (!globalThis.wx || typeof globalThis.wx.removeStorageSync !== "function") {
    return;
  }
  globalThis.wx.removeStorageSync(ACCOUNT_SESSION_KEY);
}

function buildAuthHeaders(session) {
  const normalized = normalizeStoredSession(session);
  if (!normalized.loggedIn) {
    throw new Error("账号登录已失效，请重新进入");
  }

  return {
    "x-dice-account-id": normalized.accountId,
    "x-dice-session-token": normalized.sessionToken
  };
}

async function loginWechatAccount(payload) {
  const response = await requestBackend({
    path: "/api/auth/wechat-login",
    method: "POST",
    data: {
      code: String(payload && payload.code || "").trim(),
      nickname: String(payload && payload.nickname || "").trim(),
      avatarUrl: String(payload && payload.avatarUrl || "").trim()
    }
  });

  const data = response && response.data ? response.data : response;
  return persistAccountSession(data);
}

async function fetchMyAccountProfile() {
  const session = getStoredAccountSession();
  const response = await requestBackend({
    path: "/api/account/me",
    method: "GET",
    headers: buildAuthHeaders(session)
  });

  const data = response && response.data ? response.data : response;
  return persistAccountSession({
    ...session,
    profile: data
  });
}

async function syncMyAccountProfile(patch) {
  const session = getStoredAccountSession();
  const response = await requestBackend({
    path: "/api/account/profile",
    method: "PATCH",
    headers: {
      ...buildAuthHeaders(session)
    },
    data: {
      nickname: String(patch && patch.nickname || "").trim(),
      avatarUrl: String(patch && patch.avatarUrl || "").trim()
    }
  });

  const data = response && response.data ? response.data : response;
  return persistAccountSession({
    ...session,
    profile: data
  });
}

module.exports = {
  getStoredAccountSession,
  persistAccountSession,
  clearAccountSession,
  loginWechatAccount,
  fetchMyAccountProfile,
  syncMyAccountProfile
};
