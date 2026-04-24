import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lobbyModulePath = require.resolve("../miniprogram/pages/lobby/lobby.js");
const loginFlowModulePath = require.resolve("../miniprogram/utils/wechat-login-flow.js");
const backendRequestModulePath = require.resolve("../miniprogram/utils/backend-request.js");
const { DEFAULT_PROFILE_AVATAR_ASSETS } = require("../miniprogram/utils/profile-defaults.js");
const appJsonPath = path.join(process.cwd(), "miniprogram/app.json");
const {
  LEGAL_ACCEPT_KEY,
  LEGAL_VERSION,
  NICKNAME_KEY,
  AVATAR_URL_KEY,
  WECHAT_LOGIN_TS_KEY,
  ACCOUNT_SESSION_KEY
} = require("../miniprogram/utils/constants.js");

function instantiateLobbyPage({
  storage = {},
  appWsUrl = "ws://127.0.0.1:3000/ws",
  appContainerConfig = {
    envId: "",
    service: "",
    wsPath: "/ws"
  },
  loginFlowOverride = null,
  backendRequestExportsOverride = null
} = {}) {
  const originalPage = globalThis.Page;
  const originalWx = globalThis.wx;
  const originalGetApp = globalThis.getApp;
  const originalLoginFlowCacheEntry = require.cache[loginFlowModulePath];
  const originalBackendRequestCacheEntry = require.cache[backendRequestModulePath];

  const storageState = { ...storage };
  const toasts = [];
  const modals = [];
  const navigations = [];
  const redirects = [];
  const switchTabs = [];
  const reLaunches = [];
  const tabBarState = {
    selected: -1,
    hidden: false
  };
  let pageConfig = null;

  if (loginFlowOverride) {
    require.cache[loginFlowModulePath] = {
      id: loginFlowModulePath,
      filename: loginFlowModulePath,
      loaded: true,
      exports: loginFlowOverride
    };
  }

  if (backendRequestExportsOverride) {
    require.cache[backendRequestModulePath] = {
      id: backendRequestModulePath,
      filename: backendRequestModulePath,
      loaded: true,
      exports: backendRequestExportsOverride
    };
  }

  const appInstance = {
    globalData: {
      wsUrl: appWsUrl,
      containerConfig: { ...appContainerConfig }
    }
  };

  globalThis.Page = (config) => {
    pageConfig = config;
  };
  globalThis.getApp = () => appInstance;
  globalThis.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(storageState, key) ? storageState[key] : "";
    },
    setStorageSync(key, value) {
      storageState[key] = value;
    },
    removeStorageSync(key) {
      delete storageState[key];
    },
    showToast({ title }) {
      toasts.push(String(title || ""));
    },
    showModal(options = {}) {
      modals.push(String(options.title || ""));
      if (typeof options.success === "function") {
        options.success({ confirm: false, cancel: true, content: "" });
      }
    },
    navigateTo({ url }) {
      navigations.push(String(url || ""));
    },
    redirectTo({ url }) {
      redirects.push(String(url || ""));
    },
    switchTab({ url }) {
      switchTabs.push(String(url || ""));
    },
    reLaunch({ url }) {
      reLaunches.push(String(url || ""));
    },
    cloud: {
      init() {}
    }
  };

  delete require.cache[lobbyModulePath];
  require(lobbyModulePath);

  const page = {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    setData(updates) {
      this.data = { ...this.data, ...updates };
    },
    getTabBar() {
      return {
        setData(updates) {
          Object.assign(tabBarState, updates || {});
        }
      };
    }
  };
  Object.assign(page, pageConfig);

  const cleanup = () => {
    delete require.cache[lobbyModulePath];
    if (loginFlowOverride) {
      if (originalLoginFlowCacheEntry) {
        require.cache[loginFlowModulePath] = originalLoginFlowCacheEntry;
      } else {
        delete require.cache[loginFlowModulePath];
      }
    }
    if (backendRequestExportsOverride) {
      if (originalBackendRequestCacheEntry) {
        require.cache[backendRequestModulePath] = originalBackendRequestCacheEntry;
      } else {
        delete require.cache[backendRequestModulePath];
      }
    }
    if (typeof originalPage === "undefined") {
      delete globalThis.Page;
    } else {
      globalThis.Page = originalPage;
    }
    if (typeof originalWx === "undefined") {
      delete globalThis.wx;
    } else {
      globalThis.wx = originalWx;
    }
    if (typeof originalGetApp === "undefined") {
      delete globalThis.getApp;
    } else {
      globalThis.getApp = originalGetApp;
    }
  };

  return {
    page,
    storageState,
    toasts,
    modals,
    navigations,
    redirects,
    switchTabs,
    reLaunches,
    tabBarState,
    cleanup
  };
}

test("app config starts from the lobby page instead of the standalone login page", () => {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  assert.equal(appJson.pages[0], "pages/lobby/lobby");
});

test("lobby page lets the user browse first without forcing the login gate", () => {
  const { page, reLaunches, tabBarState, cleanup } = instantiateLobbyPage();

  try {
    page.onLoad({});
    page.onShow();
    assert.equal(page.data.showLoginGate, false);
    assert.equal(page.data.loggedIn, false);
    assert.match(page.data.nickname, /^玩家\d{3}$/);
    assert.equal(DEFAULT_PROFILE_AVATAR_ASSETS.includes(page.data.avatarUrl), true);
    assert.equal(tabBarState.selected, 0);
    assert.equal(tabBarState.hidden, false);
    assert.deepEqual(reLaunches, []);
  } finally {
    cleanup();
  }
});

test("lobby page queues the intended destination before login and continues after one-tap login", async () => {
  const { page, storageState, redirects, tabBarState, cleanup } = instantiateLobbyPage({
    loginFlowOverride: {
      async performWechatOneTapLogin() {
        storageState[NICKNAME_KEY] = "阿伟";
        storageState[AVATAR_URL_KEY] = "https://example.com/a.png";
        storageState[WECHAT_LOGIN_TS_KEY] = Date.now();
        storageState[ACCOUNT_SESSION_KEY] = {
          accountId: "acct_mock_1",
          displayId: "WX-MOCK001",
          sessionToken: "session-token-1",
          loginAt: Date.now(),
          authMode: "mock",
          profile: {
            accountId: "acct_mock_1",
            displayId: "WX-MOCK001",
            nickname: "阿伟",
            avatarUrl: "https://example.com/a.png"
          }
        };
        return {
          profile: {
            nickname: "阿伟",
            avatarUrl: "https://example.com/a.png"
          }
        };
      }
    }
  });

  try {
    page.onLoad({});
    page.goCreateRoom();
    assert.equal(page.data.showLoginGate, true);
    assert.equal(page.data.loginAgreementChecked, false);
    assert.match(page.data.pendingRedirectUrl, /\/pages\/create-room\/create-room/);

    page.toggleLoginAgreement();
    await page.onWechatLogin();

    assert.equal(page.data.loggedIn, true);
    assert.equal(page.data.showLoginGate, false);
    assert.equal(tabBarState.hidden, false);
    assert.deepEqual(storageState[LEGAL_ACCEPT_KEY], {
      accepted: true,
      version: LEGAL_VERSION,
      acceptedAt: storageState[LEGAL_ACCEPT_KEY].acceptedAt
    });
    assert.equal(Number(storageState[LEGAL_ACCEPT_KEY].acceptedAt) > 0, true);
    assert.deepEqual(redirects, ["/pages/create-room/create-room"]);
  } finally {
    cleanup();
  }
});

test("lobby page auto-enters the shared room when already logged in and opened with a redirect", () => {
  const { page, redirects, cleanup } = instantiateLobbyPage({
    storage: {
      [NICKNAME_KEY]: "阿伟",
      [AVATAR_URL_KEY]: "https://example.com/a.png",
      [WECHAT_LOGIN_TS_KEY]: Date.now(),
      [ACCOUNT_SESSION_KEY]: {
        accountId: "acct_mock_1",
        displayId: "WX-MOCK001",
        sessionToken: "session-token-1",
        loginAt: Date.now(),
        authMode: "mock",
        profile: {
          accountId: "acct_mock_1",
          displayId: "WX-MOCK001",
          nickname: "阿伟",
          avatarUrl: "https://example.com/a.png"
        }
      }
    }
  });

  try {
    page.onLoad({
      redirect: encodeURIComponent("/pages/room/room?mode=join&forceNew=1&roomId=123456")
    });
    page.onShow();

    assert.deepEqual(redirects, ["/pages/room/room?mode=join&forceNew=1&roomId=123456"]);
  } finally {
    cleanup();
  }
});
