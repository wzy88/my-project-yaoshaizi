import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const roomModulePath = require.resolve("../miniprogram/pages/room/room.js");
const {
  LEGAL_ACCEPT_KEY,
  NICKNAME_KEY,
  WS_URL_KEY
} = require("../miniprogram/utils/constants.js");

function instantiateRoomPage({
  platform = "android",
  storage = {},
  appWsUrl = "ws://127.0.0.1:3000/ws",
  apiAvailability = {}
} = {}) {
  const originalPage = globalThis.Page;
  const originalWx = globalThis.wx;
  const originalGetApp = globalThis.getApp;
  const originalGetCurrentPages = globalThis.getCurrentPages;
  const originalRequirePlugin = globalThis.requirePlugin;

  const storageState = { ...storage };
  const toasts = [];
  let pageConfig = null;

  globalThis.getApp = () => ({
    globalData: {
      wsUrl: appWsUrl,
      isDevtoolsMode: platform === "devtools"
    }
  });
  globalThis.getCurrentPages = () => [];
  globalThis.requirePlugin = () => null;
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
    getSystemInfoSync() {
      return { platform };
    },
    getRecorderManager: apiAvailability.getRecorderManager || (() => ({
      onStart() {},
      onStop() {},
      onError() {},
      start() {},
      stop() {}
    })),
    createInnerAudioContext: apiAvailability.createInnerAudioContext || (() => ({
      obeyMuteSwitch: true,
      onEnded() {},
      onError() {},
      destroy() {},
      stop() {},
      play() {},
      src: ""
    })),
    showToast({ title }) {
      toasts.push(String(title || ""));
    },
    showModal() {},
    authorize() {},
    openSetting() {},
    getSetting() {},
    navigateTo() {},
    connectSocket() {
      throw new Error("connectSocket should be stubbed in the test instance");
    }
  };

  delete require.cache[roomModulePath];
  require(roomModulePath);

  const page = {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    setData(updates) {
      this.data = { ...this.data, ...updates };
    }
  };
  Object.assign(page, pageConfig);
  page.ensureSfxFiles = async () => {};

  const cleanup = () => {
    if (page.clockTimer) {
      clearInterval(page.clockTimer);
    }
    delete require.cache[roomModulePath];
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
    if (typeof originalGetCurrentPages === "undefined") {
      delete globalThis.getCurrentPages;
    } else {
      globalThis.getCurrentPages = originalGetCurrentPages;
    }
    if (typeof originalRequirePlugin === "undefined") {
      delete globalThis.requirePlugin;
    } else {
      globalThis.requirePlugin = originalRequirePlugin;
    }
  };

  return { page, toasts, storageState, cleanup };
}

test("room page: mobile join with loopback ws keeps entry panel visible and prompts for ws config", () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });

  try {
    let connectAttempts = 0;
    page.connectSocket = () => {
      connectAttempts += 1;
    };

    page.onLoad({ mode: "join", roomId: "123456" });

    assert.equal(connectAttempts, 0);
    assert.equal(page.data.showJoinPanel, true);
    assert.equal(page.data.joinRoomId, "123456");
    assert.equal(page.data.pendingActionText, "连接成功后将自动加入房间 123456");
    assert.equal(page.data.networkStatusText, "请修改地址");
    assert.match(page.data.wsHintText, /手机真机无法访问 127\.0\.0\.1/);
    assert.ok(toasts.includes("请先改成局域网IP或wss地址"));
  } finally {
    cleanup();
  }
});

test("room page: accepting legal on mobile join still reveals ws config guidance when using loopback", () => {
  const { page, toasts, storageState, cleanup } = instantiateRoomPage({
    storage: {
      [NICKNAME_KEY]: "手机玩家",
      [WS_URL_KEY]: "ws://127.0.0.1:3000/ws"
    }
  });

  try {
    let connectAttempts = 0;
    page.connectSocket = () => {
      connectAttempts += 1;
    };

    page.onLoad({ mode: "join", roomId: "654321" });
    page.acceptLegal();

    assert.equal(connectAttempts, 0);
    assert.equal(page.data.legalAccepted, true);
    assert.equal(page.data.showJoinPanel, true);
    assert.equal(page.data.pendingActionText, "连接成功后将自动加入房间 654321");
    assert.equal(page.data.networkStatusText, "请修改地址");
    assert.match(page.data.wsHintText, /手机真机无法访问 127\.0\.0\.1/);
    assert.deepEqual(storageState[LEGAL_ACCEPT_KEY].accepted, true);
    assert.ok(toasts.includes("请先改成局域网IP或wss地址"));
  } finally {
    cleanup();
  }
});

test("room page: restoring a cached session only happens for explicit resume entry", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      diceSession: {
        roomId: "288136",
        playerId: "player-old",
        resumeToken: "token-old"
      }
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({ resume: "1" });

    assert.equal(page.data.roomId, "288136");
    assert.equal(page.data.playerId, "player-old");
    assert.equal(page.data.resumeToken, "token-old");
    assert.equal(page.data.joinRoomId, "288136");
    assert.equal(page.data.showJoinPanel, true);
  } finally {
    cleanup();
  }
});

test("room page: plain entry ignores cached session and does not auto-rejoin old room", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      diceSession: {
        roomId: "288136",
        playerId: "player-old",
        resumeToken: "token-old"
      }
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({});

    assert.equal(page.data.roomId, "");
    assert.equal(page.data.playerId, "");
    assert.equal(page.data.resumeToken, "");
    assert.equal(page.data.showJoinPanel, true);
  } finally {
    cleanup();
  }
});

test("room page: mode join keeps the join panel visible until the room is actually entered", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let connectAttempts = 0;
    page.connectSocket = () => {
      connectAttempts += 1;
    };

    page.onLoad({ mode: "join", roomId: "123456" });

    assert.equal(connectAttempts, 1);
    assert.equal(page.data.showJoinPanel, true);
    assert.equal(page.data.pendingActionText, "连接成功后将自动加入房间 123456");
  } finally {
    cleanup();
  }
});

test("room page: mode create keeps the join panel visible until the room is actually created", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let connectAttempts = 0;
    page.connectSocket = () => {
      connectAttempts += 1;
    };

    page.onLoad({ mode: "create", direction: "cw", wildcardOneEnabled: "1", dicePerPlayer: "5", minOpeningCount: "5" });

    assert.equal(connectAttempts, 1);
    assert.equal(page.data.showJoinPanel, true);
    assert.equal(page.data.pendingActionText, "连接成功后将自动创建房间");
  } finally {
    cleanup();
  }
});

test("room page: onLoad survives when recorder and audio apis are unavailable", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    apiAvailability: {
      getRecorderManager() {
        throw new Error("recorder unavailable");
      },
      createInnerAudioContext() {
        throw new Error("audio unavailable");
      }
    }
  });

  try {
    assert.doesNotThrow(() => {
      page.connectSocket = () => {};
      page.onLoad({ mode: "join", roomId: "111222" });
    });
    assert.equal(page.data.joinRoomId, "111222");
  } finally {
    cleanup();
  }
});
