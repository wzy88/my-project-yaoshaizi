import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const meModulePath = require.resolve("../miniprogram/pages/me/me.js");
const loginFlowModulePath = require.resolve("../miniprogram/utils/wechat-login-flow.js");
const accountApiModulePath = require.resolve("../miniprogram/utils/account-api.js");
const {
  NICKNAME_KEY,
  AVATAR_URL_KEY,
  PROFILE_NICKNAME_CUSTOMIZED_KEY,
  ACCOUNT_SESSION_KEY
} = require("../miniprogram/utils/constants.js");

function instantiateMePage({
  storage = {},
  loginFlowOverride = null,
  accountApiOverride = null
} = {}) {
  const originalPage = globalThis.Page;
  const originalWx = globalThis.wx;
  const originalGetApp = globalThis.getApp;
  const originalLoginFlowCacheEntry = require.cache[loginFlowModulePath];
  const originalAccountApiCacheEntry = require.cache[accountApiModulePath];

  const storageState = { ...storage };
  const toasts = [];
  let pageConfig = null;

  if (loginFlowOverride) {
    require.cache[loginFlowModulePath] = {
      id: loginFlowModulePath,
      filename: loginFlowModulePath,
      loaded: true,
      exports: loginFlowOverride
    };
  }

  if (accountApiOverride) {
    require.cache[accountApiModulePath] = {
      id: accountApiModulePath,
      filename: accountApiModulePath,
      loaded: true,
      exports: accountApiOverride
    };
  }

  globalThis.getApp = () => ({
    globalData: {
      isDevtoolsMode: false
    }
  });

  globalThis.Page = (config) => {
    pageConfig = config;
  };

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
    navigateTo() {},
    reLaunch() {},
    setClipboardData() {}
  };

  delete require.cache[meModulePath];
  require(meModulePath);

  const page = {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    setData(updates) {
      this.data = { ...this.data, ...updates };
    },
    getTabBar() {
      return {
        setData() {}
      };
    }
  };
  Object.assign(page, pageConfig);

  const cleanup = () => {
    delete require.cache[meModulePath];
    if (loginFlowOverride) {
      if (originalLoginFlowCacheEntry) {
        require.cache[loginFlowModulePath] = originalLoginFlowCacheEntry;
      } else {
        delete require.cache[loginFlowModulePath];
      }
    }
    if (accountApiOverride) {
      if (originalAccountApiCacheEntry) {
        require.cache[accountApiModulePath] = originalAccountApiCacheEntry;
      } else {
        delete require.cache[accountApiModulePath];
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
    cleanup
  };
}

test("me page: saving nickname while browsing triggers login and persists the nickname", async () => {
  let loginCalls = 0;
  const { page, storageState, toasts, cleanup } = instantiateMePage({
    storage: {
      [NICKNAME_KEY]: "玩家671",
      [AVATAR_URL_KEY]: "https://example.com/cat.png"
    },
    loginFlowOverride: {
      async performWechatOneTapLogin() {
        loginCalls += 1;
        storageState[ACCOUNT_SESSION_KEY] = {
          accountId: "acct_1",
          displayId: "WX-001",
          sessionToken: "token-1",
          loggedIn: true,
          profile: {
            accountId: "acct_1",
            displayId: "WX-001",
            nickname: "阿伟",
            avatarUrl: "https://example.com/cat.png",
            stats: {}
          }
        };
        return {
          accountSession: {
            accountId: "acct_1",
            displayId: "WX-001",
            sessionToken: "token-1",
            loggedIn: true,
            profile: {
              accountId: "acct_1",
              displayId: "WX-001",
              nickname: "阿伟",
              avatarUrl: "https://example.com/cat.png",
              stats: {}
            }
          },
          profile: {
            nickname: "阿伟",
            avatarUrl: "https://example.com/cat.png"
          }
        };
      }
    },
    accountApiOverride: {
      getStoredAccountSession() {
        const stored = storageState[ACCOUNT_SESSION_KEY];
        if (stored) {
          return stored;
        }
        return {
          loggedIn: false,
          profile: {}
        };
      },
      async fetchMyAccountProfile() {
        return {
          loggedIn: true,
          profile: {
            accountId: "acct_1",
            displayId: "WX-001",
            nickname: "阿伟",
            avatarUrl: "https://example.com/cat.png",
            stats: {}
          }
        };
      },
      async syncMyAccountProfile() {
        throw new Error("should not sync before login");
      }
    }
  });

  try {
    page.onLoad();
    await page.onNicknameSave({ detail: { value: "阿伟" } });

    assert.equal(loginCalls, 1);
    assert.equal(storageState[NICKNAME_KEY], "阿伟");
    assert.equal(storageState[PROFILE_NICKNAME_CUSTOMIZED_KEY], true);
    assert.equal(page.data.nickname, "阿伟");
    assert.equal(page.data.accountReady, true);
    assert.ok(toasts.includes("登录成功，昵称已保存"));
  } finally {
    cleanup();
  }
});
