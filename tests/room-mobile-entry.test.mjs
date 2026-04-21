import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const roomModulePath = require.resolve("../miniprogram/pages/room/room.js");
const { DEFAULT_PROFILE_AVATAR_ASSETS } = require("../miniprogram/utils/profile-defaults.js");
const {
  LEGAL_ACCEPT_KEY,
  LEGAL_VERSION,
  SESSION_KEY,
  NICKNAME_KEY,
  AVATAR_URL_KEY
} = require("../miniprogram/utils/constants.js");

function instantiateRoomPage({
  platform = "android",
  storage = {},
  appWsUrl = "",
  appContainerConfig = null,
  apiAvailability = {},
  useRealSfxFiles = false
} = {}) {
  const originalPage = globalThis.Page;
  const originalWx = globalThis.wx;
  const originalGetApp = globalThis.getApp;
  const originalGetCurrentPages = globalThis.getCurrentPages;
  const originalRequirePlugin = globalThis.requirePlugin;

  const storageState = { ...storage };
  if (
    storageState[LEGAL_ACCEPT_KEY]
    && storageState[LEGAL_ACCEPT_KEY].accepted === true
    && !storageState[LEGAL_ACCEPT_KEY].version
  ) {
    storageState[LEGAL_ACCEPT_KEY] = {
      ...storageState[LEGAL_ACCEPT_KEY],
      version: LEGAL_VERSION
    };
  }
  const toasts = [];
  const modals = [];
  const reLaunches = [];
  const hiddenShareMenus = [];
  let pageConfig = null;

  globalThis.getApp = () => ({
    globalData: {
      wsUrl: appWsUrl,
      isDevtoolsMode: platform === "devtools",
      containerConfig: appContainerConfig
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
    showModal(options) {
      modals.push(options || {});
      if (options && typeof options.success === "function") {
        options.success({ confirm: true, cancel: false, content: "" });
      }
    },
    authorize() {},
    openSetting() {},
    getSetting() {},
    navigateTo() {},
    reLaunch({ url }) {
      reLaunches.push(String(url || ""));
    },
    hideShareMenu(options = {}) {
      hiddenShareMenus.push(options);
    },
    cloud: apiAvailability.cloud || null,
    env: apiAvailability.env || null,
    getFileSystemManager: apiAvailability.getFileSystemManager,
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
  if (!useRealSfxFiles) {
    page.ensureSfxFiles = async () => {};
  }

  const cleanup = () => {
    if (page.clockTimer) {
      clearInterval(page.clockTimer);
    }
    if (page.callAttentionTimer) {
      clearTimeout(page.callAttentionTimer);
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

  return { page, toasts, modals, reLaunches, hiddenShareMenus, storageState, cleanup };
}

function buildRoomStatePayload({ currentPlayerId = "P1", lastCall = null } = {}) {
  const callerCurrentCall = lastCall
    ? {
        count: lastCall.count,
        point: lastCall.point,
        by: lastCall.by,
        ts: lastCall.ts
      }
    : undefined;

  return {
    roomId: "778899",
    phase: "calling",
    round: 1,
    currentPlayerId,
    config: {
      direction: "cw",
      wildcardOneEnabled: true,
      openMode: "single",
      dicePerPlayer: 5,
      minOpeningCount: 1,
      testMode: false
    },
    players: [
      {
        id: "P1",
        nickname: "甲方",
        avatar: "",
        isOwner: true,
        onlineStatus: "online",
        turnStatus: currentPlayerId === "P1" ? "active" : "idle",
        seatIndex: 1,
        diceCupStatus: "closed",
        rollLocked: true,
        rollCountThisRound: 1,
        ...(callerCurrentCall ? { currentCall: callerCurrentCall } : {})
      },
      {
        id: "P2",
        nickname: "乙方",
        avatar: "",
        isOwner: false,
        onlineStatus: "online",
        turnStatus: currentPlayerId === "P2" ? "active" : "idle",
        seatIndex: 2,
        diceCupStatus: "closed",
        rollLocked: true,
        rollCountThisRound: 1
      }
    ],
    waitingPlayers: [],
    ...(lastCall ? { lastCall } : {}),
    networkHealth: "good",
    version: 1,
    serverTs: 1710000000000
  };
}

test("room page: roll uses the bundled audio asset while the other sfx keep the lighter generated profile", async () => {
  const files = new Map();
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws",
    useRealSfxFiles: true,
    apiAvailability: {
      env: {
        USER_DATA_PATH: "/tmp/dice-sfx"
      },
      getFileSystemManager() {
        return {
          access({ path, success, fail }) {
            if (files.has(path)) {
              success();
              return;
            }
            fail(new Error("ENOENT"));
          },
          writeFile({ filePath, data, success }) {
            files.set(filePath, data);
            success();
          }
        };
      }
    }
  });

  try {
    page.sfxContext = {};
    await page.ensureSfxFiles();

    const ok = files.get("/tmp/dice-sfx/dice_sfx_ok.wav");
    const open = files.get("/tmp/dice-sfx/dice_sfx_open.wav");
    const lose = files.get("/tmp/dice-sfx/dice_sfx_lose.wav");
    const win = files.get("/tmp/dice-sfx/dice_sfx_win.wav");

    assert.equal(page.sfxPaths.roll, "/assets/audio/dice-roll.mp3");
    assert.equal(files.has("/tmp/dice-sfx/dice_sfx_roll.wav"), false);
    assert.equal(Boolean(ok && open && lose && win), true);
    assert.equal(ok.byteLength >= 2400 && ok.byteLength <= 3000, true);
    assert.equal(open.byteLength > ok.byteLength, true);
    assert.equal(open.byteLength < 4800, true);
    assert.equal(lose.byteLength > win.byteLength, true);
  } finally {
    cleanup();
  }
});

test("room page: initial room sync with an existing call does not replay attention feedback", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });

  try {
    const sfx = [];
    const haptics = [];
    page.playSfx = (kind) => sfx.push(kind);
    page.haptic = (kind) => haptics.push(kind);
    page.resetTurnCountdown = () => {};
    page.clearTurnCountdown = () => {};
    page.setData({ playerId: "P2" });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({
        currentPlayerId: "P2",
        lastCall: { count: 5, point: 3, by: "P1", ts: 1710000000123 }
      })
    }));

    assert.deepEqual(sfx, []);
    assert.deepEqual(haptics, []);
    assert.equal(page.data.lastCallKey, "P1_5_3_1710000000123");
    assert.equal(page.data.playersDecorated.find((player) => player.id === "P1").bubbleClass.includes("latest"), true);
  } finally {
    cleanup();
  }
});

test("room page: accepted remote calls trigger attention sfx, gold latest-call border, and turn haptic", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });

  try {
    const sfx = [];
    const haptics = [];
    page.playSfx = (kind) => sfx.push(kind);
    page.haptic = (kind) => haptics.push(kind);
    page.resetTurnCountdown = () => {};
    page.clearTurnCountdown = () => {};
    page.setData({ playerId: "P2" });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({ currentPlayerId: "P1" })
    }));

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({
        currentPlayerId: "P2",
        lastCall: { count: 5, point: 3, by: "P1", ts: 1710000000456 }
      })
    }));

    assert.deepEqual(sfx, ["call"]);
    assert.deepEqual(haptics, ["light"]);
    assert.equal(page.data.lastCallKey, "P1_5_3_1710000000456");
    assert.equal(page.data.playersDecorated.find((player) => player.id === "P1").bubbleClass.includes("latest"), true);
  } finally {
    cleanup();
  }
});

test("room page: self call confirmations keep the gold latest-call border but skip duplicate attention audio", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });

  try {
    const sfx = [];
    const haptics = [];
    page.playSfx = (kind) => sfx.push(kind);
    page.haptic = (kind) => haptics.push(kind);
    page.resetTurnCountdown = () => {};
    page.clearTurnCountdown = () => {};
    page.setData({ playerId: "P1" });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({ currentPlayerId: "P1" })
    }));

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({
        currentPlayerId: "P2",
        lastCall: { count: 6, point: 4, by: "P1", ts: 1710000000789 }
      })
    }));

    assert.deepEqual(sfx, []);
    assert.deepEqual(haptics, []);
    assert.equal(page.data.lastCallKey, "P1_6_4_1710000000789");
    assert.equal(page.data.playersDecorated.find((player) => player.id === "P1").bubbleClass.includes("latest"), true);
  } finally {
    cleanup();
  }
});

test("room page: mobile join keeps the pending action when the bundled runtime target is missing", () => {
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
    assert.equal(page.data.joinRoomId, "123456");
    assert.equal(page.data.pendingActionText, "连接成功后将自动加入房间 123456");
    assert.equal(page.data.containerEnvId, "");
    assert.equal(page.data.containerService, "");
    assert.equal(page.data.containerWsPath, "/ws");
    assert.equal(page.data.networkStatusText, "服务异常");
    assert.equal(toasts.includes("请先改成局域网IP或wss地址"), false);
  } finally {
    cleanup();
  }
});

test("room page: default room id display uses the six hyphen placeholder", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });

  try {
    assert.equal(page.data.displayRoomId, "------");
  } finally {
    cleanup();
  }
});

test("room page: accepting legal on mobile join keeps the pending action until a bundled runtime target is available", () => {
  const { page, toasts, storageState, cleanup } = instantiateRoomPage({
    storage: {
      [NICKNAME_KEY]: "手机玩家"
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
    assert.equal(page.data.pendingActionText, "连接成功后将自动加入房间 654321");
    assert.equal(page.data.containerEnvId, "");
    assert.equal(page.data.containerService, "");
    assert.equal(page.data.networkStatusText, "服务异常");
    assert.deepEqual(storageState[LEGAL_ACCEPT_KEY].accepted, true);
    assert.equal(toasts.includes("请先改成局域网IP或wss地址"), false);
  } finally {
    cleanup();
  }
});

test("room page: invalid automatic join ids do not queue a pending join", () => {
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

    page.onLoad({ mode: "join", roomId: "12ab34" });

    assert.equal(connectAttempts, 1);
    assert.equal(page.data.joinRoomId, "12ab34");
    assert.equal(page.data.pendingActionText, "");
    assert.equal(page.pendingRoomAction, null);
  } finally {
    cleanup();
  }
});

test("room page: cloud container config bypasses loopback ws validation on mobile join", () => {
  const cloudCalls = [];
  const socketTask = {
    onOpen() {},
    onClose() {},
    onError() {},
    onMessage() {},
    send() {},
    close() {}
  };
  const { page, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://127.0.0.1:3000/ws",
    appContainerConfig: {
      envId: "dice-test-123",
      service: "express-rw1k",
      wsPath: "/ws"
    },
    apiAvailability: {
      cloud: {
        init(options) {
          cloudCalls.push({ type: "init", options });
        },
        connectContainer(options) {
          cloudCalls.push({ type: "connect", options });
          return Promise.resolve({ socketTask });
        }
      }
    }
  });

  try {
    page.debugClientEvent = () => {};
    page.onLoad({ mode: "join", roomId: "123456" });

    assert.equal(cloudCalls.length >= 2, true);
    assert.deepEqual(cloudCalls[0], {
      type: "init",
      options: {
        env: "dice-test-123",
        traceUser: true
      }
    });
    assert.deepEqual(cloudCalls[1], {
      type: "connect",
      options: {
        service: "express-rw1k",
        path: "/ws"
      }
    });
    assert.equal(page.data.networkStatusText, "连接中");
    assert.equal(page.data.pendingActionText, "连接成功后将自动加入房间 123456");
    assert.equal(toasts.includes("请先改成局域网IP或wss地址"), false);
  } finally {
    cleanup();
  }
});

test("room page: cloud container config falls back to app global data when page data is empty", () => {
  const cloudCalls = [];
  const socketTask = {
    onOpen() {},
    onClose() {},
    onError() {},
    onMessage() {},
    send() {},
    close() {}
  };
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://127.0.0.1:3000/ws",
    appContainerConfig: {
      envId: "dice-test-123",
      service: "express-rw1k",
      wsPath: "/ws"
    },
    apiAvailability: {
      cloud: {
        init(options) {
          cloudCalls.push({ type: "init", options });
        },
        connectContainer(options) {
          cloudCalls.push({ type: "connect", options });
          return Promise.resolve({ socketTask });
        }
      }
    }
  });

  try {
    page.debugClientEvent = () => {};
    page.data.containerEnvId = "";
    page.data.containerService = "";
    page.data.containerWsPath = "";
    page.data.wsUrl = "ws://127.0.0.1:3000/ws";

    page.connectSocket();

    assert.equal(cloudCalls.length >= 2, true);
    assert.deepEqual(cloudCalls[0], {
      type: "init",
      options: {
        env: "dice-test-123",
        traceUser: true
      }
    });
    assert.deepEqual(cloudCalls[1], {
      type: "connect",
      options: {
        service: "express-rw1k",
        path: "/ws"
      }
    });
  } finally {
    cleanup();
  }
});

test("room page: cloud container connect failure surfaces the underlying error detail", async () => {
  const { page, toasts, modals, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appContainerConfig: {
      envId: "dice-test-123",
      service: "express-rw1k",
      wsPath: "/ws"
    },
    apiAvailability: {
      cloud: {
        init() {},
        connectContainer() {
          return Promise.reject(new Error("service not found"));
        }
      }
    }
  });

  try {
    page.debugClientEvent = () => {};
    page.scheduleReconnect = () => {};
    page.onLoad({ mode: "join", roomId: "123456" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(page.data.networkStatusText, "网络异常");
    assert.equal(page.data.lastWsError, "service not found");
    assert.deepEqual(toasts, []);
    assert.equal(modals.length, 0);
  } finally {
    cleanup();
  }
});

test("room page: cloud container connect failure uses a friendly fallback when the error is empty", async () => {
  const { page, modals, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appContainerConfig: {
      envId: "dice-test-123",
      service: "express-rw1k",
      wsPath: "/ws"
    },
    apiAvailability: {
      cloud: {
        init() {},
        connectContainer() {
          return Promise.reject({});
        }
      }
    }
  });

  try {
    page.debugClientEvent = () => {};
    page.scheduleReconnect = () => {};
    page.onLoad({ mode: "join", roomId: "123456" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(page.data.lastWsError, "连接中断，请稍后重试");
    assert.equal(modals.length, 0);
  } finally {
    cleanup();
  }
});

test("room page: connection failure handler no longer surfaces blocking prompts", () => {
  const { page, toasts, modals, cleanup } = instantiateRoomPage();

  try {
    page.showConnectionFailure("service not found");
    page.showConnectionFailure("service not found");

    assert.deepEqual(toasts, []);
    assert.equal(modals.length, 0);
  } finally {
    cleanup();
  }
});

test("room page: system error packets no longer surface generic toast prompts", () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.handleServerPacket(JSON.stringify({
      event: "system:error",
      payload: {
        message: "未知错误"
      }
    }));

    assert.deepEqual(toasts, []);
  } finally {
    cleanup();
  }
});

test("room page: invalid pending join is discarded before flush can send it", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sent = [];
    page.data.connected = true;
    page.pendingRoomAction = { kind: "join", roomId: "12ab34" };
    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };

    const flushed = page.flushPendingRoomAction();

    assert.equal(flushed, false);
    assert.equal(sent.length, 0);
    assert.equal(page.pendingRoomAction, null);
    assert.equal(page.data.pendingActionText, "");
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
  } finally {
    cleanup();
  }
});

test("room page: mode join enters on the room shell while the pending join action waits", () => {
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
    assert.equal(page.data.pendingActionText, "连接成功后将自动加入房间 123456");
  } finally {
    cleanup();
  }
});

test("room page: mode create enters on the room shell while the pending create action waits", () => {
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
    assert.equal(page.data.pendingActionText, "连接成功后将自动创建房间");
  } finally {
    cleanup();
  }
});

test("room page: action ack keeps room identity on the room shell before room state arrives", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.handleServerPacket(JSON.stringify({
      event: "action:ack",
      payload: {
        ok: true,
        roomId: "123456",
        playerId: "player-a",
        resumeToken: "resume-token"
      }
    }));

    assert.equal(page.data.roomId, "123456");
    assert.equal(page.data.displayRoomId, "123456");
    assert.equal(page.data.playerId, "player-a");
    assert.equal(page.data.resumeToken, "resume-token");
    assert.equal(page.data.joinRoomId, "123456");
  } finally {
    cleanup();
  }
});

test("room page: invalid room ids fall back to the placeholder display", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.handleServerPacket(JSON.stringify({
      event: "action:ack",
      payload: {
        ok: true,
        roomId: "12ab3456",
        playerId: "player-a",
        resumeToken: "resume-token"
      }
    }));

    assert.equal(page.data.displayRoomId, "------");
  } finally {
    cleanup();
  }
});

test("room page: share payload points directly to the current room entry", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });

  try {
    page.setData({
      roomId: "123456",
      nickname: "房主阿伟"
    });

    const payload = page.onShareAppMessage();

    assert.equal(payload.title, "房主阿伟 邀你加入房间 123456");
    assert.equal(
      payload.path,
      "/pages/room/room?mode=join&forceNew=1&roomId=123456"
    );
  } finally {
    cleanup();
  }
});

test("room page: onShow reconnects an existing room session after a temporary disconnect", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let connectCalls = 0;
    page.connectSocket = () => {
      connectCalls += 1;
    };
    page.manualClose = false;
    page.pendingLeaveActionId = "";
    page.setData({
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      connected: false,
      connecting: false,
      phase: "ready",
      myDiceRolling: false,
      myDiceRevealing: false
    });

    page.onShow();

    assert.equal(connectCalls, 1);
  } finally {
    cleanup();
  }
});

test("room page: socket open rejoins the cached room when no pending action remains", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  const listeners = {};
  const socketTask = {
    onOpen(handler) {
      listeners.open = handler;
    },
    onClose(handler) {
      listeners.close = handler;
    },
    onError(handler) {
      listeners.error = handler;
    },
    onMessage(handler) {
      listeners.message = handler;
    },
    send() {},
    close() {}
  };

  try {
    const sent = [];
    page.debugClientEvent = () => {};
    page.refreshWsHint = () => {};
    page.startHeartbeat = () => {};
    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };
    globalThis.wx.connectSocket = () => socketTask;

    page.setData({
      wsUrl: "ws://192.168.1.23:3000/ws",
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      connected: false,
      connecting: false
    });

    page.connectSocket();
    assert.equal(typeof listeners.open, "function");

    listeners.open();

    assert.deepEqual(sent, [
      {
        event: "room:rejoin",
        payload: {
          roomId: "123456",
          playerId: "player-a",
          resumeToken: "resume-token"
        }
      }
    ]);
    assert.equal(page.data.connected, true);
    assert.equal(page.data.connecting, false);
  } finally {
    cleanup();
  }
});

test("room page: scheduleReconnect waits 2 seconds and does not queue duplicate retries", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });

  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  try {
    let connectCalls = 0;
    let scheduledDelay = 0;
    let timerCount = 0;

    page.connectSocket = () => {
      connectCalls += 1;
    };
    page.debugClientEvent = () => {};
    page.manualClose = false;

    globalThis.setTimeout = (fn, delay) => {
      timerCount += 1;
      scheduledDelay = Number(delay) || 0;
      fn();
      return timerCount;
    };
    globalThis.clearTimeout = () => {};

    page.scheduleReconnect();
    page.scheduleReconnect();

    assert.equal(scheduledDelay, 2000);
    assert.equal(timerCount, 1);
    assert.equal(connectCalls, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    cleanup();
  }
});

test("room page: onShow does not duplicate reconnect while a reconnect is already in progress", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let connectCalls = 0;
    page.connectSocket = () => {
      connectCalls += 1;
    };
    page.manualClose = false;
    page.pendingLeaveActionId = "";
    page.setData({
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      connected: false,
      connecting: true,
      myDiceRolling: false,
      myDiceRevealing: false
    });

    page.onShow();

    assert.equal(connectCalls, 0);
  } finally {
    cleanup();
  }
});

test("room page: socket close followed by socket error still schedules only one reconnect", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  const listeners = {};
  const socketTask = {
    onOpen(handler) {
      listeners.open = handler;
    },
    onClose(handler) {
      listeners.close = handler;
    },
    onError(handler) {
      listeners.error = handler;
    },
    onMessage(handler) {
      listeners.message = handler;
    },
    send() {},
    close() {}
  };

  try {
    let reconnectSchedules = 0;
    page.debugClientEvent = () => {};
    page.refreshWsHint = () => {};
    page.stopHeartbeat = () => {};
    page.scheduleReconnect = () => {
      reconnectSchedules += 1;
    };
    globalThis.wx.connectSocket = () => socketTask;

    page.setData({
      wsUrl: "ws://192.168.1.23:3000/ws",
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      connected: false,
      connecting: false
    });

    page.connectSocket();
    assert.equal(typeof listeners.close, "function");
    assert.equal(typeof listeners.error, "function");

    listeners.close({ code: 1006, reason: "network lost" });
    listeners.error({ errMsg: "network lost" });

    assert.equal(reconnectSchedules, 1);
  } finally {
    cleanup();
  }
});

test("room page: cold-start resume reconnects and rejoins the cached room session", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [SESSION_KEY]: {
        roomId: "123456",
        playerId: "player-a",
        resumeToken: "resume-token"
      }
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  const listeners = {};
  const sent = [];
  const socketTask = {
    onOpen(handler) {
      listeners.open = handler;
    },
    onClose(handler) {
      listeners.close = handler;
    },
    onError(handler) {
      listeners.error = handler;
    },
    onMessage(handler) {
      listeners.message = handler;
    },
    send({ data }) {
      sent.push(JSON.parse(data));
    },
    close() {}
  };

  try {
    page.debugClientEvent = () => {};
    page.refreshWsHint = () => {};
    page.startHeartbeat = () => {};
    globalThis.wx.connectSocket = () => socketTask;

    page.onLoad({ resume: "1" });

    assert.equal(page.data.roomId, "123456");
    assert.equal(page.data.playerId, "player-a");
    assert.equal(page.data.resumeToken, "resume-token");
    assert.equal(typeof listeners.open, "function");

    listeners.open();

    assert.equal(page.data.connected, true);
    assert.equal(page.data.connecting, false);
    assert.deepEqual(sent, [
      {
        event: "room:rejoin",
        payload: {
          roomId: "123456",
          playerId: "player-a",
          resumeToken: "resume-token"
        },
        actionId: sent[0].actionId
      }
    ]);
    assert.equal(page.actionEventMap[sent[0].actionId], "room:rejoin");
  } finally {
    cleanup();
  }
});

test("room page: failed rejoin ack clears the cached session and resets the room shell", () => {
  const { page, storageState, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [SESSION_KEY]: {
        roomId: "123456",
        playerId: "player-a",
        resumeToken: "resume-token"
      }
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({
      roomId: "123456",
      displayRoomId: "123456",
      joinRoomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      pendingActionText: "恢复中"
    });
    page.actionEventMap = {
      "rejoin-1": "room:rejoin"
    };

    page.handleServerPacket(JSON.stringify({
      event: "action:ack",
      payload: {
        ok: false,
        actionId: "rejoin-1",
        code: "ROOM_NOT_FOUND",
        reason: "房间不存在"
      }
    }));

    assert.equal(storageState[SESSION_KEY], undefined);
    assert.equal(page.data.roomId, "");
    assert.equal(page.data.playerId, "");
    assert.equal(page.data.resumeToken, "");
    assert.equal(page.data.displayRoomId, "------");
    assert.equal(page.data.pendingActionText, "");
  } finally {
    cleanup();
  }
});

test("room page: socket close during a pending leave finalizes the leave instead of reconnecting", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  const listeners = {};
  const socketTask = {
    onOpen(handler) {
      listeners.open = handler;
    },
    onClose(handler) {
      listeners.close = handler;
    },
    onError(handler) {
      listeners.error = handler;
    },
    onMessage(handler) {
      listeners.message = handler;
    },
    send() {},
    close() {}
  };

  try {
    let finalizeCalls = 0;
    let reconnectSchedules = 0;
    page.debugClientEvent = () => {};
    page.refreshWsHint = () => {};
    page.stopHeartbeat = () => {};
    page.finalizeLeaveRoom = () => {
      finalizeCalls += 1;
    };
    page.scheduleReconnect = () => {
      reconnectSchedules += 1;
    };
    globalThis.wx.connectSocket = () => socketTask;

    page.pendingLeaveActionId = "leave-1";
    page.setData({
      wsUrl: "ws://192.168.1.23:3000/ws",
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      connected: false,
      connecting: false
    });

    page.connectSocket();
    listeners.close({ code: 1006, reason: "network lost" });

    assert.equal(finalizeCalls, 1);
    assert.equal(reconnectSchedules, 0);
  } finally {
    cleanup();
  }
});

test("room page: socket error during a pending leave finalizes the leave instead of reconnecting", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  const listeners = {};
  const socketTask = {
    onOpen(handler) {
      listeners.open = handler;
    },
    onClose(handler) {
      listeners.close = handler;
    },
    onError(handler) {
      listeners.error = handler;
    },
    onMessage(handler) {
      listeners.message = handler;
    },
    send() {},
    close() {}
  };

  try {
    let finalizeCalls = 0;
    let reconnectSchedules = 0;
    page.debugClientEvent = () => {};
    page.refreshWsHint = () => {};
    page.stopHeartbeat = () => {};
    page.showConnectionFailure = () => {};
    page.finalizeLeaveRoom = () => {
      finalizeCalls += 1;
    };
    page.scheduleReconnect = () => {
      reconnectSchedules += 1;
    };
    globalThis.wx.connectSocket = () => socketTask;

    page.pendingLeaveActionId = "leave-1";
    page.setData({
      wsUrl: "ws://192.168.1.23:3000/ws",
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      connected: false,
      connecting: false
    });

    page.connectSocket();
    listeners.error({ errMsg: "network lost" });

    assert.equal(finalizeCalls, 1);
    assert.equal(reconnectSchedules, 0);
  } finally {
    cleanup();
  }
});

test("room page: finalizing leave clears any queued reconnect retry", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [SESSION_KEY]: {
        roomId: "123456",
        playerId: "player-a",
        resumeToken: "resume-token"
      }
    }
  });

  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  try {
    let connectCalls = 0;
    let closeCalls = 0;
    let timerIdSeq = 0;
    const queuedReconnects = new Map();

    globalThis.setTimeout = (fn, delay) => {
      const timerId = `timer-${++timerIdSeq}`;
      queuedReconnects.set(timerId, { fn, delay });
      return timerId;
    };
    globalThis.clearTimeout = (timerId) => {
      queuedReconnects.delete(timerId);
    };

    page.debugClientEvent = () => {};
    page.connectSocket = () => {
      connectCalls += 1;
    };
    page.socketTask = {
      close() {
        closeCalls += 1;
      }
    };
    page.setData({
      roomId: "123456",
      displayRoomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token"
    });

    page.scheduleReconnect();
    assert.equal(queuedReconnects.size, 1);

    page.finalizeLeaveRoom();

    assert.equal(queuedReconnects.size, 0);
    assert.equal(connectCalls, 0);
    assert.equal(closeCalls, 1);
    assert.equal(page.data.roomId, "");
    assert.equal(page.data.playerId, "");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    cleanup();
  }
});

test("room page: stale direct ws fallbacks no longer expose ws or local network jargon on join", () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
    platform: "android",
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://127.0.0.1:3000/ws"
  });

  try {
    page.onLoad({ mode: "join", roomId: "123456" });

    assert.equal(page.data.networkStatusText, "请修改地址");
    assert.equal(page.data.wsHintText.includes("ws://"), false);
    assert.equal(page.data.wsHintText.includes("局域网"), false);
    assert.deepEqual(toasts, ["当前服务连接异常，请稍后重试"]);
  } finally {
    cleanup();
  }
});

test("room page: call count options expand to the full dice total for large rooms", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({});
    page.setData({ playerId: "P1" });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "778899",
        phase: "calling",
        round: 1,
        currentPlayerId: "P1",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 1,
          testMode: false
        },
        players: Array.from({ length: 8 }, (_, index) => ({
          id: `P${index + 1}`,
          nickname: `玩家${index + 1}`,
          avatar: "",
          isOwner: index === 0,
          onlineStatus: "online",
          turnStatus: index === 0 ? "active" : "idle",
          seatIndex: index + 1,
          diceCupStatus: "closed",
          rollLocked: true,
          rollCountThisRound: 1
        })),
        waitingPlayers: [],
        networkHealth: "good",
        version: 1,
        serverTs: 1710000000000
      }
    }));

    assert.equal(page.data.maxCallCount, 40);
    assert.equal(page.data.callCountOptions.length, 40);
    assert.equal(page.data.callCountOptions[0].value, "1");
    assert.equal(page.data.callCountOptions.at(-1).value, "40");
  } finally {
    cleanup();
  }
});

test("room page: room avatars prefer bundled avatar art instead of nickname initials when no custom avatar is present", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "玩家360",
      [AVATAR_URL_KEY]: DEFAULT_PROFILE_AVATAR_ASSETS[2]
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.data.playerId = "owner-a";
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "ready",
        round: 0,
        players: [
          {
            id: "owner-a",
            nickname: "玩家360",
            avatar: "",
            isOwner: true,
            onlineStatus: "online",
            turnStatus: "active",
            seatIndex: 1,
            diceCupStatus: "closed",
            rollLocked: false
          },
          {
            id: "guest-b",
            nickname: "对手玩家",
            avatar: "",
            isOwner: false,
            onlineStatus: "online",
            turnStatus: "idle",
            seatIndex: 2,
            diceCupStatus: "closed",
            rollLocked: false
          }
        ],
        waitingPlayers: []
      }
    }));

    assert.equal(DEFAULT_PROFILE_AVATAR_ASSETS.includes(page.data.selfAvatarUrl), true);
    assert.equal(page.data.playersDecorated.every((item) => String(item.displayAvatar || "").startsWith("/assets/figma-room-v2/")), true);
  } finally {
    cleanup();
  }
});

test("room page: leave waits for the server ack before clearing the local room session", () => {
  const { page, reLaunches, storageState, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [SESSION_KEY]: {
        roomId: "123456",
        playerId: "player-a",
        resumeToken: "resume-token"
      }
    }
  });

  try {
    let sentPacket = null;
    let closeCalls = 0;
    page.socketTask = {
      send({ data, success }) {
        sentPacket = JSON.parse(data);
        if (typeof success === "function") {
          success();
        }
      },
      close() {
        closeCalls += 1;
      }
    };
    page.setData({
      connected: true,
      roomId: "123456",
      displayRoomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      joinRoomId: "123456"
    });

    page.leaveRoom();

    assert.equal(sentPacket && sentPacket.event, "room:leave");
    assert.equal(closeCalls, 0);
    assert.deepEqual(storageState[SESSION_KEY], {
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token"
    });
    assert.deepEqual(reLaunches, []);

    page.handleServerPacket(JSON.stringify({
      event: "action:ack",
      payload: {
        ok: true,
        actionId: sentPacket.actionId
      }
    }));

    assert.equal(closeCalls, 1);
    assert.equal(storageState[SESSION_KEY], undefined);
    assert.deepEqual(reLaunches, ["/pages/lobby/lobby"]);
    assert.equal(page.data.roomId, "");
    assert.equal(page.data.playerId, "");
  } finally {
    cleanup();
  }
});

test("room page: page unload best-effort notifies room leave and clears the resumable session", () => {
  const { page, storageState, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [SESSION_KEY]: {
        roomId: "123456",
        playerId: "player-a",
        resumeToken: "resume-token"
      }
    }
  });

  try {
    let sentPacket = null;
    let closeCalls = 0;
    page.socketTask = {
      send({ data, success }) {
        sentPacket = JSON.parse(data);
        if (typeof success === "function") {
          success();
        }
      },
      close() {
        closeCalls += 1;
      }
    };
    page.setData({
      connected: true,
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token"
    });

    page.onUnload();

    assert.equal(sentPacket && sentPacket.event, "room:leave");
    assert.equal(closeCalls, 1);
    assert.equal(storageState[SESSION_KEY], undefined);
  } finally {
    cleanup();
  }
});

test("room page: stale cached session is cleared once the room state no longer contains the local player", () => {
  const { page, storageState, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [SESSION_KEY]: {
        roomId: "123456",
        playerId: "player-a",
        resumeToken: "resume-token"
      }
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token"
    });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "ready",
        round: 0,
        currentPlayerId: "player-b",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false
        },
        players: [
          {
            id: "player-b",
            nickname: "对手",
            avatar: "",
            isOwner: true,
            onlineStatus: "online",
            turnStatus: "active",
            seatIndex: 1,
            diceCupStatus: "closed",
            rollLocked: false
          }
        ],
        waitingPlayers: [],
        networkHealth: "good",
        version: 1,
        serverTs: Date.now()
      }
    }));

    assert.equal(storageState[SESSION_KEY], undefined);
  } finally {
    cleanup();
  }
});

test("room page: room state decorates the shell once room data is ready", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.data.playerId = "player-a";

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "ready",
        round: 0,
        currentPlayerId: "player-a",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false
        },
        players: [
          {
            id: "player-a",
            nickname: "手机玩家",
            avatar: "",
            isOwner: true,
            onlineStatus: "online",
            turnStatus: "active",
            seatIndex: 1,
            diceCupStatus: "closed",
            rollLocked: false
          }
        ],
        waitingPlayers: [],
        networkHealth: "good",
        version: 1,
        serverTs: Date.now()
      }
    }));

    assert.equal(page.data.roomId, "123456");
    assert.equal(page.data.displayRoomId, "123456");
    assert.equal(page.data.playersDecorated.length, 1);
  } finally {
    cleanup();
  }
});

test("room page: self current call is preserved in decorated player data for the local bubble", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.data.playerId = "player-a";

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "calling",
        round: 1,
        currentPlayerId: "player-b",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false
        },
        players: [
          {
            id: "player-a",
            nickname: "手机玩家",
            avatar: "",
            isOwner: true,
            onlineStatus: "online",
            turnStatus: "idle",
            seatIndex: 1,
            diceCupStatus: "closed",
            rollLocked: false,
            currentCall: {
              count: 3,
              point: 4
            }
          },
          {
            id: "player-b",
            nickname: "对手",
            avatar: "",
            isOwner: false,
            onlineStatus: "online",
            turnStatus: "active",
            seatIndex: 2,
            diceCupStatus: "closed",
            rollLocked: false
          }
        ],
        waitingPlayers: [],
        networkHealth: "good",
        version: 1,
        serverTs: Date.now()
      }
    }));

    const selfPlayer = page.data.playersDecorated.find((item) => item.isSelf);
    assert.equal(Boolean(selfPlayer), true);
    assert.equal(selfPlayer.callText, "3个4");
    assert.equal(selfPlayer.callCount, "3");
    assert.equal(selfPlayer.callPoint, "4");
    assert.equal(Boolean(selfPlayer.callPointAsset), true);
  } finally {
    cleanup();
  }
});

test("room page: round start audio plays once when room state enters a new rolling round", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sfxCalls = [];
    page.playSfx = (kind) => {
      sfxCalls.push(kind);
    };
    page.data.playerId = "player-a";

    const basePayload = {
      roomId: "123456",
      currentPlayerId: "player-a",
      config: {
        direction: "cw",
        wildcardOneEnabled: true,
        openMode: "single",
        dicePerPlayer: 5,
        minOpeningCount: 5,
        testMode: false
      },
      players: [
        {
          id: "player-a",
          nickname: "手机玩家",
          avatar: "",
          isOwner: true,
          onlineStatus: "online",
          turnStatus: "active",
          seatIndex: 1,
          diceCupStatus: "closed",
          rollLocked: false
        }
      ],
      waitingPlayers: [],
      networkHealth: "good",
      version: 1,
      serverTs: Date.now()
    };

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...basePayload,
        phase: "ready",
        round: 0
      }
    }));

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...basePayload,
        phase: "rolling",
        round: 1
      }
    }));

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...basePayload,
        phase: "rolling",
        round: 1
      }
    }));

    assert.deepEqual(sfxCalls, ["roundStart"]);
  } finally {
    cleanup();
  }
});

test("room page: self area no longer tracks or renders the previous call hint", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.data.playerId = "player-a";

    const basePayload = {
      roomId: "123456",
      currentPlayerId: "player-b",
      config: {
        direction: "cw",
        wildcardOneEnabled: true,
        openMode: "single",
        dicePerPlayer: 5,
        minOpeningCount: 5,
        testMode: false
      },
      players: [
        {
          id: "player-a",
          nickname: "手机玩家",
          avatar: "",
          isOwner: true,
          onlineStatus: "online",
          turnStatus: "idle",
          seatIndex: 1,
          diceCupStatus: "closed",
          rollLocked: false
        },
        {
          id: "player-b",
          nickname: "对手",
          avatar: "",
          isOwner: false,
          onlineStatus: "online",
          turnStatus: "active",
          seatIndex: 2,
          diceCupStatus: "closed",
          rollLocked: false
        }
      ],
      waitingPlayers: [],
      networkHealth: "good",
      version: 1,
      serverTs: Date.now()
    };

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...basePayload,
        phase: "calling",
        round: 1,
        lastCall: {
          by: "player-b",
          count: 3,
          point: 4,
          ts: 101
        }
      }
    }));

    assert.equal(Object.prototype.hasOwnProperty.call(page.data, "selfLastCallText"), false);

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...basePayload,
        phase: "opening",
        round: 1,
        lastCall: {
          by: "player-b",
          count: 3,
          point: 4,
          ts: 101
        }
      }
    }));

    assert.equal(Object.prototype.hasOwnProperty.call(page.data, "selfLastCallText"), false);

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...basePayload,
        phase: "calling",
        round: 2,
        currentPlayerId: "player-a",
        lastCall: {
          by: "player-a",
          count: 4,
          point: 6,
          ts: 202
        }
      }
    }));

    assert.equal(Object.prototype.hasOwnProperty.call(page.data, "selfLastCallText"), false);
  } finally {
    cleanup();
  }
});

test("room page: seating panel keeps all 8 seats after room state refresh", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.data.playerId = "owner-a";
    page.setData({
      phase: "ready",
      round: 0,
      selfIsOwner: true,
      playersRaw: [
        {
          id: "owner-a",
          nickname: "房主",
          avatar: "",
          isOwner: true,
          onlineStatus: "online",
          turnStatus: "active",
          seatIndex: 1,
          diceCupStatus: "closed",
          rollLocked: false
        },
        {
          id: "guest-b",
          nickname: "八号位玩家",
          avatar: "",
          isOwner: false,
          onlineStatus: "online",
          turnStatus: "idle",
          seatIndex: 8,
          diceCupStatus: "closed",
          rollLocked: false
        }
      ]
    });

    page.openSeatingPanel({
      id: "guest-b",
      nickname: "八号位玩家",
      seatIndex: 8
    });

    assert.equal(page.data.seatingVisible, true);
    assert.equal(page.data.seatRows.length, 8);
    assert.equal(page.data.seatingSelectedSeatIndex, 8);

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "ready",
        round: 0,
        currentPlayerId: "owner-a",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false
        },
        players: [
          {
            id: "owner-a",
            nickname: "房主",
            avatar: "",
            isOwner: true,
            onlineStatus: "online",
            turnStatus: "active",
            seatIndex: 1,
            diceCupStatus: "closed",
            rollLocked: false
          },
          {
            id: "guest-b",
            nickname: "八号位玩家",
            avatar: "",
            isOwner: false,
            onlineStatus: "online",
            turnStatus: "idle",
            seatIndex: 8,
            diceCupStatus: "closed",
            rollLocked: false
          }
        ],
        waitingPlayers: [],
        networkHealth: "good",
        version: 2,
        serverTs: Date.now()
      }
    }));

    assert.equal(page.data.seatRows.length, 8);
    assert.equal(page.data.seatingSelectedSeatIndex, 8);
    assert.match(page.data.seatingSelectedText, /^8号/);
  } finally {
    cleanup();
  }
});

test("room page: three-player seat swaps change the actual on-table slot instead of keeping a compact layout", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.data.playerId = "owner-a";

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "ready",
        round: 0,
        currentPlayerId: "owner-a",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false
        },
        players: [
          {
            id: "owner-a",
            nickname: "房主",
            avatar: "",
            isOwner: true,
            onlineStatus: "online",
            turnStatus: "active",
            seatIndex: 1,
            diceCupStatus: "closed",
            rollLocked: false
          },
          {
            id: "guest-b",
            nickname: "二号位玩家",
            avatar: "",
            isOwner: false,
            onlineStatus: "online",
            turnStatus: "idle",
            seatIndex: 2,
            diceCupStatus: "closed",
            rollLocked: false
          },
          {
            id: "guest-c",
            nickname: "五号位玩家",
            avatar: "",
            isOwner: false,
            onlineStatus: "online",
            turnStatus: "idle",
            seatIndex: 5,
            diceCupStatus: "closed",
            rollLocked: false
          }
        ],
        waitingPlayers: [],
        networkHealth: "good",
        version: 1,
        serverTs: Date.now()
      }
    }));

    const before = page.data.playersDecorated.find((item) => item.id === "guest-b");
    assert.equal(before.visualSlotIndex, 5);
    assert.equal(before.seatSlotClass, "slot-lower-left");

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "ready",
        round: 0,
        currentPlayerId: "owner-a",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false
        },
        players: [
          {
            id: "owner-a",
            nickname: "房主",
            avatar: "",
            isOwner: true,
            onlineStatus: "online",
            turnStatus: "active",
            seatIndex: 1,
            diceCupStatus: "closed",
            rollLocked: false
          },
          {
            id: "guest-b",
            nickname: "四号位玩家",
            avatar: "",
            isOwner: false,
            onlineStatus: "online",
            turnStatus: "idle",
            seatIndex: 4,
            diceCupStatus: "closed",
            rollLocked: false
          },
          {
            id: "guest-c",
            nickname: "五号位玩家",
            avatar: "",
            isOwner: false,
            onlineStatus: "online",
            turnStatus: "idle",
            seatIndex: 5,
            diceCupStatus: "closed",
            rollLocked: false
          }
        ],
        waitingPlayers: [],
        networkHealth: "good",
        version: 2,
        serverTs: Date.now()
      }
    }));

    const after = page.data.playersDecorated.find((item) => item.id === "guest-b");
    assert.equal(after.visualSlotIndex, 1);
    assert.equal(after.seatSlotClass, "slot-upper-left");
  } finally {
    cleanup();
  }
});

test("room page: seating panel moves the selected player into an empty seat", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sent = [];
    let hapticCalls = 0;
    let sfxCalls = 0;

    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };
    page.haptic = () => {
      hapticCalls += 1;
    };
    page.playSfx = () => {
      sfxCalls += 1;
    };

    page.data.playerId = "owner-a";
    page.setData({
      phase: "ready",
      round: 0,
      selfIsOwner: true,
      playersRaw: [
        {
          id: "owner-a",
          nickname: "房主",
          avatar: "",
          isOwner: true,
          onlineStatus: "online",
          turnStatus: "active",
          seatIndex: 1,
          diceCupStatus: "closed",
          rollLocked: false
        },
        {
          id: "guest-b",
          nickname: "二号位玩家",
          avatar: "",
          isOwner: false,
          onlineStatus: "online",
          turnStatus: "idle",
          seatIndex: 2,
          diceCupStatus: "closed",
          rollLocked: false
        }
      ]
    });

    page.openSeatingPanel({
      id: "guest-b",
      nickname: "二号位玩家",
      seatIndex: 2
    });

    page.onTapSeatRow({
      currentTarget: {
        dataset: {
          seat: 5
        }
      }
    });

    assert.deepEqual(sent, [
      {
        event: "room:seat:set",
        payload: { playerId: "guest-b", seatIndex: 5 }
      }
    ]);
    assert.equal(page.data.seatingSelectedSeatIndex, 0);
    assert.equal(page.data.seatingSelectedText, "未选择");
    assert.equal(hapticCalls, 1);
    assert.equal(sfxCalls, 0);
  } finally {
    cleanup();
  }
});

test("room page: seating direction change keeps haptic but stays audio silent", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sent = [];
    let hapticCalls = 0;
    let sfxCalls = 0;

    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };
    page.haptic = () => {
      hapticCalls += 1;
    };
    page.playSfx = () => {
      sfxCalls += 1;
    };

    page.setData({
      phase: "ready",
      round: 0,
      selfIsOwner: true,
      roomConfig: {
        direction: "cw"
      }
    });

    page.onSeatingSelectDirection({
      currentTarget: {
        dataset: {
          dir: "ccw"
        }
      }
    });

    assert.deepEqual(sent, [
      {
        event: "room:config:update",
        payload: { direction: "ccw" }
      }
    ]);
    assert.equal(hapticCalls, 1);
    assert.equal(sfxCalls, 0);
  } finally {
    cleanup();
  }
});

test("room page: seating panel label shows only the nickname without the raw player id", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.data.playerId = "owner-a";
    page.setData({
      phase: "ready",
      round: 0,
      selfIsOwner: true,
      playersRaw: [
        {
          id: "owner-a",
          nickname: "房主",
          avatar: "",
          isOwner: true,
          onlineStatus: "online",
          turnStatus: "active",
          seatIndex: 1,
          diceCupStatus: "closed",
          rollLocked: false
        },
        {
          id: "e26995abcdef",
          nickname: "玩家昵称",
          avatar: "",
          isOwner: false,
          onlineStatus: "online",
          turnStatus: "idle",
          seatIndex: 2,
          diceCupStatus: "closed",
          rollLocked: false
        }
      ]
    });

    page.openSeatingPanel({
      id: "e26995abcdef",
      nickname: "玩家昵称",
      seatIndex: 2
    });

    const row = page.data.seatRows.find((item) => item.seatIndex === 2);
    assert.equal(row.label, "玩家昵称");
  } finally {
    cleanup();
  }
});

test("room page: seating panel swaps two occupied seats", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sent = [];
    let hapticCalls = 0;
    let sfxCalls = 0;

    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };
    page.haptic = () => {
      hapticCalls += 1;
    };
    page.playSfx = () => {
      sfxCalls += 1;
    };

    page.data.playerId = "owner-a";
    page.setData({
      phase: "ready",
      round: 0,
      selfIsOwner: true,
      playersRaw: [
        {
          id: "owner-a",
          nickname: "房主",
          avatar: "",
          isOwner: true,
          onlineStatus: "online",
          turnStatus: "active",
          seatIndex: 1,
          diceCupStatus: "closed",
          rollLocked: false
        },
        {
          id: "guest-b",
          nickname: "二号位玩家",
          avatar: "",
          isOwner: false,
          onlineStatus: "online",
          turnStatus: "idle",
          seatIndex: 2,
          diceCupStatus: "closed",
          rollLocked: false
        },
        {
          id: "guest-c",
          nickname: "六号位玩家",
          avatar: "",
          isOwner: false,
          onlineStatus: "online",
          turnStatus: "idle",
          seatIndex: 6,
          diceCupStatus: "closed",
          rollLocked: false
        }
      ]
    });

    page.openSeatingPanel({
      id: "guest-b",
      nickname: "二号位玩家",
      seatIndex: 2
    });

    page.onTapSeatRow({
      currentTarget: {
        dataset: {
          seat: 6
        }
      }
    });

    assert.deepEqual(sent, [
      {
        event: "room:seat:swap",
        payload: { playerIdA: "guest-b", playerIdB: "guest-c" }
      }
    ]);
    assert.equal(page.data.seatingSelectedSeatIndex, 0);
    assert.equal(page.data.seatingSelectedText, "未选择");
    assert.equal(hapticCalls, 1);
    assert.equal(sfxCalls, 0);
  } finally {
    cleanup();
  }
});

test("room page: owner ready topbar menu exposes seating setup before settings and leave", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let opened = 0;

    page.setData({
      selfIsOwner: true,
      phase: "ready",
      round: 0,
      roomId: "123456"
    });
    page.openSeatingPanel = () => {
      opened += 1;
    };

    page.onTapMore();
    assert.equal(page.data.topbarMenuVisible, true);

    page.onTapMenuSeating();

    assert.equal(page.data.topbarMenuVisible, false);
    assert.equal(opened, 1);
  } finally {
    cleanup();
  }
});

test("room page: native top-right share menu is hidden so sharing stays in the left menu", () => {
  const { page, hiddenShareMenus, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({});
    page.onShow();

    assert.equal(hiddenShareMenus.length >= 2, true);
    assert.deepEqual(hiddenShareMenus[0], {
      menus: ["shareAppMessage"]
    });
  } finally {
    cleanup();
  }
});

test("room page: non-owner topbar menu routes settings without showing seating", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let toolsOpened = 0;
    let seatingOpened = 0;

    page.setData({
      selfIsOwner: false,
      phase: "ready",
      round: 0,
      roomId: "123456"
    });
    page.openToolsMenu = () => {
      toolsOpened += 1;
    };
    page.openSeatingPanel = () => {
      seatingOpened += 1;
    };

    page.onTapMore();
    assert.equal(page.data.topbarMenuVisible, true);

    page.onTapMenuSettings();

    assert.equal(page.data.topbarMenuVisible, false);
    assert.equal(toolsOpened, 1);
    assert.equal(seatingOpened, 0);
  } finally {
    cleanup();
  }
});

test("room page: tools menu exposes both sound and vibration toggles", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let capturedItems = null;

    page.devtoolsMode = true;
    page.setData({
      selfIsOwner: true,
      phase: "ready",
      round: 0,
      roomConfig: {
        testMode: false
      }
    });
    page.showActionSheetSafe = ({ itemList }) => {
      capturedItems = itemList;
    };

    page.openToolsMenu();

    assert.deepEqual(capturedItems, ["关闭音效", "关闭震动"]);
  } finally {
    cleanup();
  }
});

test("room page: hitting the 5-roll cap makes further roll attempts a silent no-op", () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let hapticCalls = 0;
    let sfxCalls = 0;
    let rollingCalls = 0;
    const sent = [];

    page.haptic = () => {
      hapticCalls += 1;
    };
    page.playSfx = () => {
      sfxCalls += 1;
    };
    page.showMyDiceDrawerRolling = () => {
      rollingCalls += 1;
    };
    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };

    page.data.playerId = "player-a";
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "rolling",
        round: 1,
        currentPlayerId: "player-a",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false
        },
        players: [
          {
            id: "player-a",
            nickname: "手机玩家",
            avatar: "",
            isOwner: true,
            onlineStatus: "online",
            turnStatus: "active",
            seatIndex: 1,
            diceCupStatus: "open",
            rollLocked: false,
            rollCountThisRound: 5
          }
        ],
        waitingPlayers: [],
        networkHealth: "good",
        version: 2,
        serverTs: Date.now()
      }
    }));

    page.rollDice();

    assert.equal(page.data.selfRollCountThisRound, 5);
    assert.equal(hapticCalls, 0);
    assert.equal(sfxCalls, 0);
    assert.equal(rollingCalls, 0);
    assert.deepEqual(sent, []);
    assert.deepEqual(toasts, []);
  } finally {
    cleanup();
  }
});

test("room page: private dice results wait for the roll audio window before staggered reveal", async () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const waitFor = async (predicate, timeoutMs = 200, stepMs = 5) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (predicate()) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, stepMs));
      }
      return predicate();
    };

    page.getSelfRollAudioDurationMs = () => 30;
    page.getSelfRollRevealStaggerMs = () => 12;
    page.getSelfRollSettleDurationMs = () => 24;

    page.setData({
      phase: "rolling",
      selfIsWaiting: false,
      roomConfig: {
        dicePerPlayer: 5
      }
    });

    page.showMyDiceDrawerRolling();
    page.handleServerPacket(JSON.stringify({
      event: "dice:privateResult",
      payload: {
        dice: [1, 2, 3, 4, 5]
      }
    }));

    assert.equal(page.data.myDiceRolling, true);
    assert.equal(page.data.myDiceRevealing, false);
    assert.equal(page.data.roomSelfDiceFaces.filter((item) => item.revealed).length, 0);

    await new Promise((resolve) => setTimeout(resolve, 36));

    assert.equal(page.data.myDiceRolling, false);
    assert.equal(page.data.myDiceRevealing, true);
    assert.equal(page.data.roomSelfDiceFaces.filter((item) => item.revealed).length >= 1, true);
    assert.equal(page.data.roomSelfDiceFaces.filter((item) => item.revealed).length < 5, true);

    await new Promise((resolve) => setTimeout(resolve, 56));

    assert.equal(await waitFor(() => page.data.myDiceRevealing === false), true);
    assert.equal(page.data.myDiceJustRevealed, true);
    assert.deepEqual(page.data.privateDice, [1, 2, 3, 4, 5]);
    assert.deepEqual(page.data.roomSelfDiceFaces.map((item) => item.value), [1, 2, 3, 4, 5]);
    assert.equal(page.data.roomSelfDiceFaces.every((item) => item.revealed), true);

    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(page.data.myDiceJustRevealed, false);
  } finally {
    cleanup();
  }
});

test("room page: returning from background settles an interrupted self-roll animation", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      connected: true,
      connecting: false,
      phase: "rolling",
      selfIsWaiting: false,
      myDiceVisible: true,
      myDiceRolling: true,
      myDiceRevealing: false,
      privateDice: [1, 2, 3, 4, 5],
      roomConfig: {
        dicePerPlayer: 5
      }
    });

    page.roomSelfRollingTimer = setInterval(() => {}, 1000);
    page.myDiceAutoPeekTimer = setTimeout(() => {}, 1000);
    page.onHide();

    assert.equal(Boolean(page.selfRollInterruptedOnHide), true);
    assert.equal(page.roomSelfRollingTimer, null);
    assert.equal(page.myDiceAutoPeekTimer, null);

    page.onShow();

    assert.equal(page.data.myDiceRolling, false);
    assert.equal(page.data.myDiceRevealing, false);
    assert.equal(page.data.myDiceVisible, true);
    assert.deepEqual(page.data.roomSelfDiceFaces.map((item) => item.value), [1, 2, 3, 4, 5]);
  } finally {
    cleanup();
  }
});

test("room page: returning from background can rebuild stable dice from pending private results", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.pendingPrivateDice = [6, 5, 4, 3, 2];
    page.setData({
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token",
      connected: true,
      connecting: false,
      phase: "rolling",
      selfIsWaiting: false,
      myDiceVisible: true,
      myDiceRolling: true,
      myDiceRevealing: false,
      privateDice: [],
      roomConfig: {
        dicePerPlayer: 5
      }
    });

    page.roomSelfRollingTimer = setInterval(() => {}, 1000);
    page.onHide();
    page.onShow();

    assert.equal(page.data.myDiceRolling, false);
    assert.equal(page.data.myDiceRevealing, false);
    assert.equal(page.data.myDiceVisible, true);
    assert.deepEqual(page.data.privateDice, [6, 5, 4, 3, 2]);
    assert.deepEqual(page.data.roomSelfDiceFaces.map((item) => item.value), [6, 5, 4, 3, 2]);
  } finally {
    cleanup();
  }
});

test("room page: direct private dice restore reveals stable dice immediately when no roll animation is active", async () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.getSelfRollSettleDurationMs = () => 12;
    page.setData({
      phase: "rolling",
      selfIsWaiting: false,
      myDiceVisible: false,
      myDiceRolling: false,
      myDiceRevealing: false,
      roomConfig: {
        dicePerPlayer: 5
      }
    });

    page.handleServerPacket(JSON.stringify({
      event: "dice:privateResult",
      payload: {
        dice: [2, 4, 6, 1, 3]
      }
    }));

    assert.equal(page.data.myDiceRolling, false);
    assert.equal(page.data.myDiceRevealing, false);
    assert.equal(page.data.myDiceVisible, true);
    assert.equal(page.data.myDiceJustRevealed, true);
    assert.deepEqual(page.data.privateDice, [2, 4, 6, 1, 3]);
    assert.deepEqual(page.data.roomSelfDiceFaces.map((item) => item.value), [2, 4, 6, 1, 3]);
    assert.equal(page.data.roomSelfDiceFaces.every((item) => item.revealed), true);

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(page.data.myDiceJustRevealed, false);
  } finally {
    cleanup();
  }
});

test("room page: all players see the settlement dialog and only the loser can continue", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.startSettlementCountdown = () => {
      page.setData({ settlementContinueSec: 2 });
    };
    page.data.playersRaw = [
      { id: "winner", nickname: "祝英台", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "closed", rollLocked: false },
      { id: "loser", nickname: "玩家", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: false }
    ];

    const openResult = {
      round: 1,
      openerId: "winner",
      targets: [
        {
          targetId: "loser",
          declared: { count: 10, point: 4 },
          actual: 5,
          winnerId: "winner"
        }
      ],
      serverTs: Date.now()
    };

    const roundSummary = {
      round: 1,
      roomId: "123456",
      players: [
        { playerId: "winner", dice: [4, 1, 1, 4, 4] },
        { playerId: "loser", dice: [4, 4, 4, 1, 4] }
      ],
      openResult,
      serverTs: Date.now()
    };

    page.data.playerId = "winner";
    page.showSettlementPanel(openResult, roundSummary);
    assert.equal(page.data.settlementVisible, true);
    assert.equal(page.data.settlementCanContinue, false);
    assert.equal(page.data.settlementDeclaredText, "10个");
    assert.equal(page.data.settlementActualText, "5个");

    page.data.playerId = "loser";
    page.showSettlementPanel(openResult, roundSummary);
    assert.equal(page.data.settlementVisible, true);
    assert.equal(page.data.settlementCanContinue, true);
    assert.equal(page.data.settlementRows.length, 2);
  } finally {
    cleanup();
  }
});

test("room page: settlement audio plays once when the dialog first appears and does not stack with win lose cues", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sfxCalls = [];
    page.playSfx = (kind) => {
      sfxCalls.push(kind);
    };
    page.startSettlementCountdown = () => {
      page.setData({ settlementContinueSec: 2 });
    };
    page.data.playerId = "winner";
    page.data.playersRaw = [
      { id: "winner", nickname: "赢家", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "closed", rollLocked: false },
      { id: "loser", nickname: "输家", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: false }
    ];

    const openResult = {
      round: 3,
      openerId: "winner",
      targets: [
        {
          targetId: "loser",
          declared: { count: 8, point: 5 },
          actual: 4,
          winnerId: "winner"
        }
      ],
      serverTs: Date.now()
    };

    const roundSummary = {
      round: 3,
      roomId: "123456",
      players: [
        { playerId: "winner", dice: [5, 2, 5, 1, 5] },
        { playerId: "loser", dice: [1, 5, 3, 2, 4] }
      ],
      openResult,
      serverTs: Date.now()
    };

    page.handleServerPacket(JSON.stringify({
      event: "open:result",
      payload: openResult
    }));
    page.handleServerPacket(JSON.stringify({
      event: "round:summary",
      payload: roundSummary
    }));

    assert.deepEqual(sfxCalls, ["settlement"]);
    assert.equal(page.data.settlementVisible, true);
    assert.equal(page.data.settlementRows.length, 2);
  } finally {
    cleanup();
  }
});

test("room page: hud primary button keeps the rolling cue instead of reusing the bundled primary cue", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sfxCalls = [];
    const sent = [];
    page.playSfx = (kind) => {
      sfxCalls.push(kind);
    };
    page.haptic = () => {};
    page.showMyDiceDrawerRolling = () => {};
    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };

    page.setData({
      phase: "rolling",
      canPrimaryAction: true,
      selfIsWaiting: false,
      selfHasDice: false,
      selfRollLocked: false,
      selfRollCountThisRound: 0,
      recording: false,
      myDiceRolling: false
    });

    page.onHudPrimaryAction();

    assert.deepEqual(sfxCalls, ["roll"]);
    assert.deepEqual(sent, [{ event: "dice:roll", payload: {} }]);
  } finally {
    cleanup();
  }
});

test("room page: opening the call panel from the hud primary button stays audio silent but gives immediate haptic feedback", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sfxCalls = [];
    const haptics = [];
    page.playSfx = (kind) => {
      sfxCalls.push(kind);
    };
    page.haptic = (kind) => {
      haptics.push(kind);
    };
    page.setData({
      phase: "calling",
      currentPlayerId: "player-a",
      playerId: "player-a",
      selfIsWaiting: false,
      callPanelVisible: false,
      callPanelExpanded: false,
      lastCallObj: { count: 3, point: 4 }
    });
    page.getMaxCallCount = () => 10;

    page.onHudPrimaryAction();

    assert.equal(page.data.callPanelVisible, true);
    assert.equal(page.data.callPanelExpanded, true);
    assert.deepEqual(sfxCalls, []);
    assert.deepEqual(haptics, ["light"]);
  } finally {
    cleanup();
  }
});

test("room page: submitting a manual call from the panel uses the bundled primary cue", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sfxCalls = [];
    const sent = [];
    page.playSfx = (kind) => {
      sfxCalls.push(kind);
    };
    page.haptic = () => {};
    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };
    page.setData({
      phase: "calling",
      currentPlayerId: "player-a",
      playerId: "player-a",
      selfIsWaiting: false,
      callForcedOpen: false,
      callPanelVisible: true,
      callPanelExpanded: true,
      callCount: "4",
      callPoint: "5",
      primaryActionText: "叫牌"
    });

    page.makeCallWithInput();

    assert.deepEqual(sfxCalls, ["primary"]);
    assert.deepEqual(sent, [{ event: "call:make", payload: { count: 4, point: 5 } }]);
    assert.equal(page.data.callPanelVisible, false);
  } finally {
    cleanup();
  }
});

test("room page: manual join rejects non-6-digit room ids with a toast", () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
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
    page.setData({ joinRoomId: "12ab34" });

    page.joinRoom();

    assert.equal(connectAttempts, 0);
    assert.equal(page.data.pendingActionText, "");
    assert.ok(toasts.includes("房间不存在或房间号有误"));
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
