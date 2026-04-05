import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const indexModulePath = require.resolve("../miniprogram/pages/index/index.js");
const backendRequestModulePath = require.resolve("../miniprogram/utils/backend-request.js");
const {
  LEGAL_ACCEPT_KEY,
  NICKNAME_KEY,
  AVATAR_URL_KEY,
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
  showModalResponses = [],
  backendRequestExportsOverride = null,
  userProfileResponse = {
    nickName: "阿伟",
    avatarUrl: "https://example.com/avatar.png"
  },
  userProfileError = null
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
    getUserProfile({ success, fail }) {
      if (userProfileError) {
        fail(userProfileError);
        return;
      }
      success({
        userInfo: userProfileResponse
      });
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
    cloud: {
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

test("index page: wechat login stores avatar nickname and resumes the shared room redirect", async () => {
  const { page, storageState, redirects, tabSwitches, toasts, requests, cleanup } = instantiateIndexPage();

  try {
    page.onLoad({
      redirect: encodeURIComponent("/pages/room/room?mode=join&forceNew=1&roomId=123456")
    });

    await page.onWechatLogin();

    assert.equal(storageState[NICKNAME_KEY], "阿伟");
    assert.equal(storageState[AVATAR_URL_KEY], "https://example.com/avatar.png");
    assert.equal(Number(storageState[WECHAT_LOGIN_TS_KEY]) > 0, true);
    assert.equal(storageState[ACCOUNT_SESSION_KEY].accountId, "acct_mock_1");
    assert.equal(storageState[LEGAL_ACCEPT_KEY].accepted, true);
    assert.deepEqual(redirects, ["/pages/room/room?mode=join&forceNew=1&roomId=123456"]);
    assert.deepEqual(tabSwitches, []);
    assert.equal(requests[0].url, "http://127.0.0.1:3000/api/auth/wechat-login");
    assert.equal(requests[0].method, "POST");
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

test("index page: blocks login with a clear cloud-config hint when backend target is missing", async () => {
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
    assert.equal(page.data.connectionHintText, "未配置云托管服务，请先填写服务名，路径一般填 /ws");

    await page.onWechatLogin();

    assert.equal(getLoginCalls(), 0);
    assert.deepEqual(requests, []);
    assert.equal(toasts.includes("请先配置云托管"), true);
  } finally {
    cleanup();
  }
});

test("index page: login page can save cloud container config directly", () => {
  const {
    page,
    storageState,
    showModals,
    cleanup
  } = instantiateIndexPage({
    appWsUrl: "",
    showModalResponses: [
      { confirm: true, content: "dice-prod" },
      { confirm: true, content: "prod-env-1" },
      { confirm: true, content: "ws" }
    ]
  });

  try {
    page.onLoad({});
    page.openConnectionSettings();

    assert.deepEqual(showModals.map((item) => item.title), [
      "云托管服务名",
      "云托管环境ID",
      "WebSocket 路径"
    ]);
    assert.equal(storageState.diceCloudServiceV1, "dice-prod");
    assert.equal(storageState.diceCloudEnvIdV1, "prod-env-1");
    assert.equal(storageState.diceCloudWsPathV1, "/ws");
    assert.equal(page.data.connectionHintText, "");
    assert.equal(page.data.backendReady, true);
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
    assert.equal(page.data.connectionHintText, "未配置云托管服务，请先填写服务名，路径一般填 /ws");
  } finally {
    cleanup();
  }
});

test("index page: surfaces a concise error when user denies wechat profile authorization", async () => {
  const { page, toasts, cleanup } = instantiateIndexPage({
    userProfileError: {
      errMsg: "getUserProfile:fail auth deny"
    }
  });

  try {
    page.onLoad({});
    await page.onWechatLogin();

    assert.equal(toasts.includes("需要授权微信头像昵称后继续"), true);
    assert.equal(page.data.loginHintText, "需要授权微信头像昵称后继续");
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
      toasts.includes("当前后端服务里没有微信登录接口，请确认服务名或地址正确，并重新部署最新后端"),
      true
    );
    assert.equal(
      page.data.loginHintText,
      "当前后端服务里没有微信登录接口，请确认服务名或地址正确，并重新部署最新后端"
    );
  } finally {
    cleanup();
  }
});
