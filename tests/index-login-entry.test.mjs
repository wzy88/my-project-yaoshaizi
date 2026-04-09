import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const indexModulePath = require.resolve("../miniprogram/pages/index/index.js");
const backendRequestModulePath = require.resolve("../miniprogram/utils/backend-request.js");
const { DEFAULT_PROFILE_AVATAR_ASSETS } = require("../miniprogram/utils/profile-defaults.js");
const {
  LEGAL_ACCEPT_KEY,
  NICKNAME_KEY,
  AVATAR_URL_KEY,
  PROFILE_NICKNAME_CUSTOMIZED_KEY,
  WECHAT_LOGIN_TS_KEY,
  ACCOUNT_SESSION_KEY
} = require("../miniprogram/utils/constants.js");

function instantiateIndexPage({
  storage = {},
  loginCode = "wx-code-123",
  accountLoginResponse = null,
  requestResponse = null,
  requestError = null,
  appWsUrl = "ws://127.0.0.1:3000/ws",
  appContainerConfig = {
    envId: "",
    service: "",
    wsPath: "/ws"
  },
  cloudApi = null,
  showModalResponses = [],
  backendRequestExportsOverride = null
} = {}) {
  const originalPage = globalThis.Page;
  const originalWx = globalThis.wx;
  const originalGetApp = globalThis.getApp;
  const originalBackendRequestCacheEntry = require.cache[backendRequestModulePath];

  const storageState = { ...storage };
  const redirects = [];
  const tabSwitches = [];
  const toasts = [];
  const requests = [];
  const showModals = [];
  let loginCalls = 0;
  let pageConfig = null;
  const appInstance = {
    globalData: {
      wsUrl: appWsUrl,
      containerConfig: { ...appContainerConfig }
    }
  };

  if (backendRequestExportsOverride) {
    require.cache[backendRequestModulePath] = {
      id: backendRequestModulePath,
      filename: backendRequestModulePath,
      loaded: true,
      exports: backendRequestExportsOverride
    };
  }

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
    login({ success }) {
      loginCalls += 1;
      success({ code: loginCode });
    },
    redirectTo({ url }) {
      redirects.push(String(url || ""));
    },
    switchTab({ url }) {
      tabSwitches.push(String(url || ""));
    },
    showToast({ title }) {
      toasts.push(String(title || ""));
    },
    showModal(options = {}) {
      showModals.push({
        title: String(options.title || ""),
        content: String(options.content || "")
      });
      const nextResponse = showModalResponses.length
        ? showModalResponses.shift()
        : { confirm: false, cancel: true, content: "" };
      if (typeof options.success === "function") {
        options.success(nextResponse);
      }
    },
    request({ url, method, data, success }) {
      requests.push({
        url: String(url || ""),
        method: String(method || "GET").toUpperCase(),
        data
      });
      if (requestError) {
        throw requestError;
      }
      if (requestResponse) {
        success(requestResponse);
        return;
      }
      success({
        statusCode: 200,
        data: {
          ok: true,
          data: accountLoginResponse || {
            sessionToken: "session-token-1",
            loginAt: Date.now(),
            authMode: "mock",
            profile: {
              accountId: "acct_mock_1",
              displayId: "WX-MOCK001",
              nickname: String(data && data.nickname || ""),
              avatarUrl: String(data && data.avatarUrl || ""),
              createdAt: Date.now(),
              lastLoginAt: Date.now(),
              provider: "wechat",
              stats: {
                totalRounds: 0,
                roundsWon: 0,
                roundsLost: 0,
                totalCallsMade: 0,
                totalOpenRequests: 0,
                roomsCreated: 0,
                roomsJoined: 0
              },
              recentRooms: []
            }
          }
        }
      });
    },
    navigateTo() {},
    cloud: cloudApi || {
      init() {}
    }
  };

  delete require.cache[indexModulePath];
  require(indexModulePath);

  const page = {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    setData(updates) {
      this.data = { ...this.data, ...updates };
    }
  };
  Object.assign(page, pageConfig);

  const cleanup = () => {
    delete require.cache[indexModulePath];
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
    redirects,
    tabSwitches,
    toasts,
    requests,
    showModals,
    getLoginCalls: () => loginCalls,
    cleanup
  };
}

test("index page: wechat login stores a default avatar nickname and resumes the shared room redirect", async () => {
  const { page, storageState, redirects, tabSwitches, toasts, requests, cleanup } = instantiateIndexPage();

  try {
    page.onLoad({
      redirect: encodeURIComponent("/pages/room/room?mode=join&forceNew=1&roomId=123456")
    });

    await page.onWechatLogin();

    assert.match(storageState[NICKNAME_KEY], /^玩家\d{3}$/);
    assert.equal(DEFAULT_PROFILE_AVATAR_ASSETS.includes(storageState[AVATAR_URL_KEY]), true);
    assert.equal(Number(storageState[WECHAT_LOGIN_TS_KEY]) > 0, true);
    assert.equal(storageState[ACCOUNT_SESSION_KEY].accountId, "acct_mock_1");
    assert.equal(storageState[LEGAL_ACCEPT_KEY].accepted, true);
    assert.deepEqual(redirects, ["/pages/room/room?mode=join&forceNew=1&roomId=123456"]);
    assert.deepEqual(tabSwitches, []);
    assert.equal(requests[0].url, "http://127.0.0.1:3000/api/auth/wechat-login");
    assert.equal(requests[0].method, "POST");
    assert.match(String(requests[0].data.nickname || ""), /^玩家\d{3}$/);
    assert.equal(DEFAULT_PROFILE_AVATAR_ASSETS.includes(String(requests[0].data.avatarUrl || "")), true);
    assert.equal(toasts.includes("登录成功"), true);
  } finally {
    cleanup();
  }
});

test("index page: an already logged-in user auto-enters the lobby on show", () => {
  const { page, tabSwitches, cleanup } = instantiateIndexPage({
    storage: {
      [NICKNAME_KEY]: "阿伟",
      [AVATAR_URL_KEY]: "wxfile://avatar",
      [WECHAT_LOGIN_TS_KEY]: Date.now(),
      [ACCOUNT_SESSION_KEY]: {
        accountId: "acct_mock_1",
        displayId: "WX-MOCK001",
        sessionToken: "token-1",
        loginAt: Date.now(),
        authMode: "mock",
        profile: {
          accountId: "acct_mock_1",
          displayId: "WX-MOCK001"
        }
      }
    }
  });

  try {
    page.onLoad({});
    page.onShow();

    assert.deepEqual(tabSwitches, ["/pages/lobby/lobby"]);
  } finally {
    cleanup();
  }
});

test("index page: blocks login with a product-style service hint when backend target is missing", async () => {
  const {
    page,
    toasts,
    requests,
    getLoginCalls,
    cleanup
  } = instantiateIndexPage({
    appWsUrl: "",
    appContainerConfig: {
      envId: "",
      service: "",
      wsPath: "/ws"
    }
  });

  try {
    page.onLoad({});
    assert.equal(page.data.connectionHintText, "当前服务暂不可用，请联系开发同学检查服务配置");

    await page.onWechatLogin();

    assert.equal(getLoginCalls(), 0);
    assert.deepEqual(requests, []);
    assert.equal(toasts.includes("当前服务暂不可用，请联系开发同学检查服务配置"), true);
  } finally {
    cleanup();
  }
});

test("index page: on load it prepares a stable default avatar and nickname before login", () => {
  const { page, storageState, cleanup } = instantiateIndexPage();

  try {
    page.onLoad({});

    assert.match(String(storageState[NICKNAME_KEY] || ""), /^玩家\d{3}$/);
    assert.equal(DEFAULT_PROFILE_AVATAR_ASSETS.includes(String(storageState[AVATAR_URL_KEY] || "")), true);
    assert.equal(page.data.profileTitle, "准备开局");
  } finally {
    cleanup();
  }
});

test("index page: logged-in legacy default profile is normalized back to the local bundled avatar set", () => {
  const { page, storageState, cleanup } = instantiateIndexPage({
    storage: {
      [NICKNAME_KEY]: "玩家512",
      [AVATAR_URL_KEY]: "https://example.com/legacy-avatar.png",
      [WECHAT_LOGIN_TS_KEY]: Date.now(),
      [ACCOUNT_SESSION_KEY]: {
        accountId: "acct_mock_legacy",
        displayId: "WX-LEGACY1",
        sessionToken: "session-legacy-1",
        loginAt: Date.now(),
        authMode: "mock",
        profile: {
          accountId: "acct_mock_legacy",
          displayId: "WX-LEGACY1",
          nickname: "玩家512",
          nicknameCustomized: false,
          avatarUrl: "https://example.com/legacy-avatar.png"
        }
      }
    }
  });

  try {
    page.onLoad({});

    assert.equal(DEFAULT_PROFILE_AVATAR_ASSETS.includes(String(storageState[AVATAR_URL_KEY] || "")), true);
    assert.equal(storageState[PROFILE_NICKNAME_CUSTOMIZED_KEY], false);
    assert.notEqual(String(storageState[AVATAR_URL_KEY] || ""), "https://example.com/legacy-avatar.png");
  } finally {
    cleanup();
  }
});

test("index page: removed bundled woman avatar is reassigned to one of the remaining defaults", () => {
  const { page, storageState, cleanup } = instantiateIndexPage({
    storage: {
      [NICKNAME_KEY]: "玩家286",
      [AVATAR_URL_KEY]: "/assets/figma-room-v2/avatar-woman.png"
    }
  });

  try {
    page.onLoad({});

    assert.equal(DEFAULT_PROFILE_AVATAR_ASSETS.includes(String(storageState[AVATAR_URL_KEY] || "")), true);
    assert.notEqual(String(storageState[AVATAR_URL_KEY] || ""), "/assets/figma-room-v2/avatar-woman.png");
  } finally {
    cleanup();
  }
});

test("index page: falls back cleanly when backend-request helper exports are stale", () => {
  const realBackendRequest = require(backendRequestModulePath);
  const { page, cleanup } = instantiateIndexPage({
    appWsUrl: "",
    backendRequestExportsOverride: {
      requestBackend: realBackendRequest.requestBackend,
      deriveHttpBaseUrl: realBackendRequest.deriveHttpBaseUrl
    }
  });

  try {
    assert.doesNotThrow(() => page.onLoad({}));
    assert.equal(page.data.connectionHintText, "当前服务暂不可用，请联系开发同学检查服务配置");
  } finally {
    cleanup();
  }
});

test("index page: translates legacy 404 login responses into a deploy hint", async () => {
  const { page, toasts, cleanup } = instantiateIndexPage({
    requestResponse: {
      statusCode: 404,
      data: {
        ok: false,
        message: "not found"
      }
    }
  });

  try {
    page.onLoad({});
    await page.onWechatLogin();

    assert.equal(
      toasts.includes("当前服务还未部署完整，请联系开发同学检查微信登录接口"),
      true
    );
    assert.equal(
      page.data.loginHintText,
      "当前服务还未部署完整，请联系开发同学检查微信登录接口"
    );
  } finally {
    cleanup();
  }
});

test("index page: invalid cloud host errors are translated into a config hint", async () => {
  const { page, toasts, cleanup } = instantiateIndexPage({
    appWsUrl: "",
    appContainerConfig: {
      envId: "prod-env-1",
      service: "dice-prod",
      wsPath: "/ws"
    },
    cloudApi: {
      init() {},
      callContainer({ fail }) {
        fail({
          errMsg: "invalid host. For more information, please refer to https://docs.cloudbase.net/error-code/service/INVALID_HOST"
        });
      }
    }
  });

  try {
    page.onLoad({});
    await page.onWechatLogin();

    assert.equal(
      page.data.loginHintText,
      "当前服务连接配置异常，请联系开发同学检查云托管服务名和环境绑定"
    );
    assert.equal(
      toasts.includes("当前服务连接配置异常，请联系开发同学检查云托管服务名和环境绑定"),
      true
    );
  } finally {
    cleanup();
  }
});
