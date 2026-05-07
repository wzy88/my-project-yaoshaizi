import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const roomModulePath = require.resolve("../miniprogram/pages/room/room.js");
const { DEFAULT_PROFILE_AVATAR_ASSETS } = require("../miniprogram/utils/profile-defaults.js");
const { buildLocalRoomThemeManifest } = require("../miniprogram/utils/room-theme-loader.js");
const {
  LEGAL_ACCEPT_KEY,
  LEGAL_VERSION,
  SESSION_KEY,
  ROOM_THEME_CACHE_KEY,
  NICKNAME_KEY,
  AVATAR_URL_KEY,
  PROFILE_NICKNAME_CUSTOMIZED_KEY,
  ACCOUNT_SESSION_KEY,
  WECHAT_LOGIN_TS_KEY,
  TURN_ALERT_SFX_ENABLED_KEY
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
    getWindowInfo: apiAvailability.getWindowInfo,
    getMenuButtonBoundingClientRect: apiAvailability.getMenuButtonBoundingClientRect,
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
    request: apiAvailability.request,
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
    if (typeof page.clearTurnCountdown === "function") {
      page.clearTurnCountdown();
    }
    if (typeof page.clearSettlementCountdown === "function") {
      page.clearSettlementCountdown();
    }
    if (typeof page.clearPendingLeaveRequest === "function") {
      page.clearPendingLeaveRequest();
    }
    if (typeof page.clearMyDiceTimers === "function") {
      page.clearMyDiceTimers();
    }
    if (typeof page.stopHeartbeat === "function") {
      page.stopHeartbeat();
    }
    if (typeof page.clearSfxStopTimer === "function") {
      page.clearSfxStopTimer();
    }
    if (page.reconnectTimer) {
      clearTimeout(page.reconnectTimer);
      page.reconnectTimer = null;
    }
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

test("room page: countdown resyncs when the same turn receives a refreshed server deadline", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });
  const originalNow = Date.now;
  let now = 1_000_000;

  try {
    Date.now = () => now;
    page.resetTurnCountdown("1:calling:P1:0", now + 18000, now);
    assert.equal(page.data.turnCountdownSec, 18);

    page.resetTurnCountdown("1:calling:P1:0", now + 30000, now);
    assert.equal(page.data.turnCountdownSec, 30);
  } finally {
    Date.now = originalNow;
    cleanup();
  }
});

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

    assert.equal(page.sfxPaths.roll, "/pages/room/assets/audio/dice-roll.mp3");
    assert.equal(page.sfxPaths.loseAlert, "/pages/room/assets/audio/lose-alert.mp3");
    assert.equal(page.sfxPaths.turnAlert, "/pages/room/assets/audio/turn-alert.mp3");
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

test("room page: turn alert sfx plays fully until another sfx takes over", async () => {
  const stopCalls = [];
  const playCalls = [];
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });

  try {
    page.sfxContext = {
      src: "",
      stop() {
        stopCalls.push(this.src);
      },
      play() {
        playCalls.push(this.src);
      }
    };
    page.sfxPaths = {
      turnAlert: "/pages/room/assets/audio/turn-alert.mp3",
      call: "/tmp/dice_sfx_call.wav"
    };
    page.playSfx("turnAlert");
    assert.deepEqual(playCalls, ["/pages/room/assets/audio/turn-alert.mp3"]);

    await new Promise((resolve) => setTimeout(resolve, 16));
    assert.deepEqual(stopCalls, [""]);

    page.playSfx("call");
    await new Promise((resolve) => setTimeout(resolve, 16));
    assert.deepEqual(playCalls, ["/pages/room/assets/audio/turn-alert.mp3", "/tmp/dice_sfx_call.wav"]);
    assert.deepEqual(stopCalls, ["", "/pages/room/assets/audio/turn-alert.mp3"]);
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

test("room page: accepted remote calls trigger the turn alert when it becomes my turn", () => {
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

    assert.deepEqual(sfx, ["turnAlert"]);
    assert.deepEqual(haptics, ["heavy"]);
    assert.equal(page.data.lastCallKey, "P1_5_3_1710000000456");
    assert.equal(page.data.playersDecorated.find((player) => player.id === "P1").bubbleClass.includes("latest"), true);
  } finally {
    cleanup();
  }
});

test("room page: turn alert sound switch mutes only the turn alert audio", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [TURN_ALERT_SFX_ENABLED_KEY]: false
    }
  });

  try {
    const sfx = [];
    const haptics = [];
    page.playSfx = (kind) => sfx.push(kind);
    page.haptic = (kind) => haptics.push(kind);
    page.resetTurnCountdown = () => {};
    page.clearTurnCountdown = () => {};
    page.setData({ playerId: "P2", turnAlertSfxEnabled: false });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({ currentPlayerId: "P1" })
    }));

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({
        currentPlayerId: "P2",
        lastCall: { count: 5, point: 3, by: "P1", ts: 1710000000460 }
      })
    }));

    assert.deepEqual(sfx, []);
    assert.deepEqual(haptics, ["heavy"]);
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
      [NICKNAME_KEY]: "阿伟玩家"
    }
  });

  try {
    let connectAttempts = 0;
    page.connectSocket = () => {
      connectAttempts += 1;
    };

    page.onLoad({ mode: "join", roomId: "654321" });
    page.setData({ legalAgreementChecked: true });
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

test("room page: accepting legal blocks an invalid nickname before entering", () => {
  const { page, toasts, storageState, cleanup } = instantiateRoomPage({
    storage: {}
  });

  try {
    page.onLoad({ mode: "join", roomId: "654321" });
    page.setData({ nickname: "玩家12345678901", legalAgreementChecked: true });

    page.acceptLegal();

    assert.equal(page.data.legalAccepted, false);
    assert.equal(page.data.showLegalModal, true);
    assert.equal(storageState[LEGAL_ACCEPT_KEY], undefined);
    assert.equal(toasts.includes("昵称需为1-12个字符"), true);
  } finally {
    cleanup();
  }
});

test("room page: agreeing is required before the share-entry drawer can continue", () => {
  const { page, toasts, storageState, cleanup } = instantiateRoomPage({
    storage: {}
  });

  try {
    page.onLoad({ mode: "join", roomId: "654321" });
    page.acceptLegal();

    assert.equal(page.data.legalAccepted, false);
    assert.equal(page.data.showLegalModal, true);
    assert.equal(storageState[LEGAL_ACCEPT_KEY], undefined);
    assert.equal(toasts.includes("请先勾选协议"), true);
  } finally {
    cleanup();
  }
});

test("room page: short safe-area devices scale the playfield instead of clipping the table bottom", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    apiAvailability: {
      getWindowInfo() {
        return {
          statusBarHeight: 47,
          windowWidth: 393,
          windowHeight: 852,
          screenHeight: 852,
          safeArea: {
            top: 59,
            bottom: 818
          }
        };
      },
      getMenuButtonBoundingClientRect() {
        return {
          top: 59,
          height: 32,
          bottom: 91
        };
      }
    }
  });

  try {
    page.onLoad({});
    assert.match(page.data.roomPlayfieldStyle, /translateY\(-48rpx\) scale\(0\.\d+\)/);
    assert.doesNotMatch(page.data.roomPlayfieldStyle, /scale\(1\)/);
  } finally {
    cleanup();
  }
});

test("room page: entry confirm can refresh to another generated nickname before first join", () => {
  const { page, storageState, cleanup } = instantiateRoomPage({
    storage: {}
  });

  const originalDateNow = Date.now;
  const originalMathRandom = Math.random;

  try {
    Date.now = () => 1712345678901;
    Math.random = () => 0.2468;
    page.setData({ nickname: "玩家111" });

    page.refreshEntryNickname();

    assert.match(page.data.nickname, /^玩家\d{3}$/);
    assert.notEqual(page.data.nickname, "玩家111");
    assert.equal(storageState[NICKNAME_KEY], page.data.nickname);
    assert.equal(storageState[PROFILE_NICKNAME_CUSTOMIZED_KEY], false);
  } finally {
    Date.now = originalDateNow;
    Math.random = originalMathRandom;
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
        config: {
          env: "dice-test-123"
        },
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
        config: {
          env: "dice-test-123"
        },
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

test("room page: join entry for the same room restores the cached session automatically", () => {
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

  try {
    page.connectSocket = () => {};
    page.onLoad({ mode: "join", roomId: "123456" });

    assert.equal(page.data.roomId, "123456");
    assert.equal(page.data.playerId, "player-a");
    assert.equal(page.data.resumeToken, "resume-token");
    assert.equal(page.data.displayRoomId, "123456");
  } finally {
    cleanup();
  }
});

test("room page: create flow falls back to the selected theme when server state omits themeId", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({
      roomId: "778899",
      joinRoomId: "778899",
      playerId: "P1",
      createRoomThemeId: "ruby-red",
      roomThemeId: "ruby-red",
      hasCreatedRoomLocally: true
    });
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...buildRoomStatePayload({
          currentPlayerId: "P1",
          lastCall: null
        }),
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 1,
          testMode: false
        }
      }
    }));

    assert.equal(page.data.roomThemeId, "ruby-red");
    assert.equal(page.data.roomThemeClass, "room-theme-ruby-red");
  } finally {
    cleanup();
  }
});

test("room page: mode create keeps the selected theme through room state sync", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({
      mode: "create",
      direction: "cw",
      wildcardOneEnabled: "1",
      dicePerPlayer: "5",
      minOpeningCount: "5",
      themeId: "imperial-red"
    });

    assert.equal(page.data.createRoomThemeId, "imperial-red");
    assert.equal(page.data.roomThemeId, "imperial-red");
    assert.equal(page.data.roomThemeClass, "room-theme-imperial-red");

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...buildRoomStatePayload({
          currentPlayerId: "P1",
          lastCall: null
        }),
        phase: "ready",
        round: 0,
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false,
          themeId: "imperial-red"
        }
      }
    }));

    assert.equal(page.data.roomThemeId, "imperial-red");
    assert.equal(page.data.roomThemeClass, "room-theme-imperial-red");
  } finally {
    cleanup();
  }
});

test("room page: mode create accepts color aliases before sending room config", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({
      mode: "create",
      direction: "cw",
      wildcardOneEnabled: "1",
      dicePerPlayer: "5",
      minOpeningCount: "5",
      themeId: "red"
    });

    const config = page.buildCreateConfigOrToast();
    assert.equal(page.data.createRoomThemeId, "imperial-red");
    assert.equal(page.data.roomThemeId, "imperial-red");
    assert.equal(config.themeId, "imperial-red");
  } finally {
    cleanup();
  }
});

test("room page: create payload keeps each selected premium theme without waiting on remote theme prefetch", async () => {
  const sentPackets = [];
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({
      legalAccepted: true,
      connected: true,
      nickname: "手机玩家",
      avatarUrl: "",
      createDirection: "cw",
      createWildcardOneEnabled: true,
      createDicePerPlayer: "5",
      createMinOpeningCount: "5",
      createTestMode: false
    });
    page.socketTask = {
      send({ data, success }) {
        sentPackets.push(JSON.parse(data));
        if (typeof success === "function") {
          success();
        }
      }
    };

    const themeIds = ["ruby-red", "imperial-red", "glacier-blue"];
    for (const themeId of themeIds) {
      sentPackets.length = 0;
      page.setData({
        createRoomThemeId: themeId,
        roomThemeManifest: buildLocalRoomThemeManifest(themeId),
        roomThemeId: themeId,
        roomThemeClass: `room-theme-${themeId}`
      });
      const config = page.buildCreateConfigOrToast();

      assert.equal(config.themeId, themeId);
      await page.sendCreateActionAfterThemeLoad({ kind: "create", config });

      assert.equal(sentPackets.length, 1);
      assert.equal(sentPackets[0].event, "room:create");
      assert.equal(sentPackets[0].payload.config.themeId, themeId);
      assert.notEqual(sentPackets[0].payload.config.themeId, "jade-green");
    }
  } finally {
    cleanup();
  }
});

test("room page: mode join uses the queried room theme when server state omits themeId", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({
      mode: "join",
      roomId: "778899",
      themeId: "ruby-red"
    });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...buildRoomStatePayload({
          roomId: "778899",
          currentPlayerId: "P1",
          lastCall: null
        }),
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false
        }
      }
    }));

    assert.equal(page.data.roomThemeId, "ruby-red");
    assert.equal(page.data.roomThemeClass, "room-theme-ruby-red");
  } finally {
    cleanup();
  }
});

test("room page: mode join applies the server room theme even when query and cache disagree", () => {
  const { page, storageState, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [ROOM_THEME_CACHE_KEY]: {
        "778899": "jade-green"
      }
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({
      mode: "join",
      roomId: "778899",
      themeId: "jade-green"
    });
    page.setData({ playerId: "P2" });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...buildRoomStatePayload({
          currentPlayerId: "P1",
          lastCall: null
        }),
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false,
          themeId: "ruby-red"
        }
      }
    }));

    assert.equal(page.data.roomThemeId, "ruby-red");
    assert.equal(page.data.roomThemeClass, "room-theme-ruby-red");
    assert.equal(storageState[ROOM_THEME_CACHE_KEY]["778899"], "ruby-red");
  } finally {
    cleanup();
  }
});

test("room page: mode join canonicalizes server color aliases before rendering", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({
      mode: "join",
      roomId: "778899",
      themeId: "jade-green"
    });
    page.setData({ playerId: "P2" });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...buildRoomStatePayload({
          currentPlayerId: "P1",
          lastCall: null
        }),
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 5,
          testMode: false,
          themeId: "white"
        }
      }
    }));

    assert.equal(page.data.roomThemeId, "glacier-blue");
    assert.equal(page.data.roomThemeClass, "room-theme-glacier-blue");
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
    assert.equal(page.data.roomThemeReady, false);
  } finally {
    cleanup();
  }
});

test("room page: join with a routed theme hint keeps the shell ready instead of flashing green", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({ mode: "join", roomId: "123456", themeId: "ruby-red" });

    assert.equal(page.data.roomThemeId, "ruby-red");
    assert.equal(page.data.roomThemeReady, true);
    assert.equal(page.data.roomThemeLoading, false);
  } finally {
    cleanup();
  }
});

test("room page: join keeps the shell ready when the room theme was cached locally", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [ROOM_THEME_CACHE_KEY]: {
        "123456": "glacier-blue"
      }
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({ mode: "join", roomId: "123456" });

    assert.equal(page.data.roomThemeId, "glacier-blue");
    assert.equal(page.data.roomThemeReady, true);
    assert.equal(page.data.roomThemeLoading, false);
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

test("room page: mode create does not show the entry legal drawer", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {},
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.connectSocket = () => {};
    page.onLoad({ mode: "create", direction: "cw", wildcardOneEnabled: "1", dicePerPlayer: "5", minOpeningCount: "5" });

    assert.equal(page.data.showLegalModal, false);
    assert.equal(page.data.legalAccepted, false);
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

test("room page: action ack applies the server theme immediately before room state arrives", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.actionEventMap = {
      "create-1": "room:create"
    };

    page.handleServerPacket(JSON.stringify({
      event: "action:ack",
      payload: {
        ok: true,
        actionId: "create-1",
        roomId: "123456",
        playerId: "player-a",
        resumeToken: "resume-token",
        themeId: "ruby-red"
      }
    }));

    assert.equal(page.data.roomThemeId, "ruby-red");
    assert.equal(page.data.roomThemeClass, "room-theme-ruby-red");
    assert.equal(page.data.joinRoomId, "123456");
  } finally {
    cleanup();
  }
});

test("room page: expired account session during join no longer retries as guest", async () => {
  const sentPackets = [];
  const { page, storageState, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家",
      [ACCOUNT_SESSION_KEY]: {
        accountId: "acct-1",
        displayId: "WX-001",
        sessionToken: "expired-token",
        loginAt: 123456,
        authMode: "wechat",
        profile: {
          accountId: "acct-1",
          displayId: "WX-001",
          nickname: "手机玩家",
          avatarUrl: ""
        }
      },
      [WECHAT_LOGIN_TS_KEY]: 123456
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.socketTask = {
      send({ data }) {
        sentPackets.push(JSON.parse(data));
      }
    };
    page.setData({
      connected: true,
      legalAccepted: true,
      joinRoomId: "123456",
      nickname: "手机玩家",
      avatarUrl: ""
    });
    page.actionEventMap = {
      "join-1": "room:join"
    };

    page.handleServerPacket(JSON.stringify({
      event: "action:ack",
      payload: {
        ok: false,
        actionId: "join-1",
        code: "FORBIDDEN",
        reason: "账号登录已失效，请重新进入"
      }
    }));

    assert.equal(storageState[ACCOUNT_SESSION_KEY], undefined);
    assert.equal(storageState[WECHAT_LOGIN_TS_KEY], undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(toasts.includes("账号登录已失效，请重新进入"), true);
    assert.equal(sentPackets.length, 0);
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
      "/pages/room/room?mode=join&forceNew=1&roomId=123456&themeId=jade-green"
    );
  } finally {
    cleanup();
  }
});

test("room page: share payload carries the current themed room skin", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    }
  });

  try {
    page.setData({
      roomId: "123456",
      nickname: "房主阿伟",
      roomThemeId: "ruby-red"
    });

    const payload = page.onShareAppMessage();

    assert.equal(
      payload.path,
      "/pages/room/room?mode=join&forceNew=1&roomId=123456&themeId=ruby-red"
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

test("room page: incoming last call immediately locks stale count choices", () => {
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
    page.setData({
      playerId: "P1",
      lastCallObj: null,
      callCount: "2",
      callPoint: "3"
    });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({
        currentPlayerId: "P1",
        lastCall: {
          count: 4,
          point: 5,
          by: "P2",
          ts: 1710000000100
        }
      })
    }));

    assert.equal(page.data.callCount, "4");
    assert.equal(page.data.callPoint, "6");
    assert.equal(page.data.callCountOptions.find((item) => item.value === "3").disabled, true);
    assert.equal(page.data.callCountOptions.find((item) => item.value === "4").disabled, false);
    assert.equal(page.data.callPointOptionItems.find((item) => item.value === "5").disabled, true);
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

test("room page: page unload closes the socket but preserves the resumable session", () => {
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
    let closeCalls = 0;
    page.socketTask = {
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

    assert.equal(closeCalls, 1);
    assert.deepEqual(storageState[SESSION_KEY], {
      roomId: "123456",
      playerId: "player-a",
      resumeToken: "resume-token"
    });
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

test("room page: side seat avatars align in two vertical columns and bubbles sit close to cups", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  const readCoord = (style, key) => {
    const match = String(style || "").match(new RegExp(`${key}:([\\d.]+)rpx`));
    return match ? Number(match[1]) / 2 : NaN;
  };

  try {
    page.data.playerId = "owner-a";
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "calling",
        round: 1,
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
          { id: "owner-a", nickname: "本人", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "active", seatIndex: 1, diceCupStatus: "closed", rollLocked: true },
          { id: "p2", nickname: "左下", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: true, currentCall: { count: 8, point: 6, by: "p2", ts: 1710000000100 } },
          { id: "p3", nickname: "左中", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 3, diceCupStatus: "closed", rollLocked: true, currentCall: { count: 9, point: 5, by: "p3", ts: 1710000000200 } },
          { id: "p4", nickname: "左上", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 4, diceCupStatus: "closed", rollLocked: true, currentCall: { count: 10, point: 4, by: "p4", ts: 1710000000300 } },
          { id: "p5", nickname: "顶部", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 5, diceCupStatus: "closed", rollLocked: true, currentCall: { count: 7, point: 2, by: "p5", ts: 1710000000350 } },
          { id: "p6", nickname: "右上", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 6, diceCupStatus: "closed", rollLocked: true, currentCall: { count: 11, point: 3, by: "p6", ts: 1710000000400 } },
          { id: "p7", nickname: "右中", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 7, diceCupStatus: "closed", rollLocked: true, currentCall: { count: 12, point: 2, by: "p7", ts: 1710000000500 } },
          { id: "p8", nickname: "右下", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 8, diceCupStatus: "closed", rollLocked: true, currentCall: { count: 13, point: 1, by: "p8", ts: 1710000000600 } }
        ],
        waitingPlayers: [],
        lastCall: { count: 13, point: 1, by: "p8", ts: 1710000000600 },
        networkHealth: "good",
        version: 1,
        serverTs: Date.now()
      }
    }));

    const bySlot = new Map(page.data.playersDecorated.map((item) => [item.seatSlotClass, item]));
    const topSlot = bySlot.get("slot-top");
    const leftSlots = ["slot-upper-left", "slot-mid-left", "slot-lower-left"].map((slot) => bySlot.get(slot));
    const rightSlots = ["slot-upper-right", "slot-mid-right", "slot-lower-right"].map((slot) => bySlot.get(slot));

    assert.equal(readCoord(topSlot.seatStyle, "top"), 168);
    assert.equal(readCoord(topSlot.bubbleStyle, "left"), 248);
    assert.equal(readCoord(topSlot.bubbleStyle, "top"), 165);
    assert.equal(readCoord(topSlot.bubbleStyle, "top") <= readCoord(topSlot.seatStyle, "top"), true);
    assert.equal(readCoord(topSlot.bubbleStyle, "left") > readCoord(topSlot.seatStyle, "left") + 40, true);
    assert.deepEqual(leftSlots.map((item) => readCoord(item.seatStyle, "left")), [42, 42, 42]);
    assert.deepEqual(rightSlots.map((item) => readCoord(item.seatStyle, "left")), [333, 333, 333]);
    assert.deepEqual(leftSlots.map((item) => readCoord(item.seatStyle, "top")), [290, 396, 526]);
    assert.deepEqual(rightSlots.map((item) => readCoord(item.seatStyle, "top")), [290, 396, 526]);
    assert.deepEqual(leftSlots.map((item) => readCoord(item.bubbleStyle, "left")), [144, 144, 144]);
    assert.deepEqual(rightSlots.map((item) => readCoord(item.bubbleStyle, "left")), [231, 231, 231]);
    assert.deepEqual(leftSlots.map((item) => readCoord(item.bubbleStyle, "top")), [250, 356, 486]);
    assert.deepEqual(rightSlots.map((item) => readCoord(item.bubbleStyle, "top")), [250, 356, 486]);
  } finally {
    cleanup();
  }
});

test("room page: seat nickname display keeps a five-character nickname intact", () => {
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
        phase: "calling",
        round: 1,
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
          { id: "owner-a", nickname: "手机玩家", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "active", seatIndex: 1, diceCupStatus: "closed", rollLocked: true },
          { id: "p2", nickname: "编号952", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: true }
        ],
        waitingPlayers: [],
        networkHealth: "good",
        version: 1,
        serverTs: Date.now()
      }
    }));

    const player = page.data.playersDecorated.find((item) => item.id === "p2");
    assert.equal(player.nicknameShort, "编号952");
    assert.equal(player.nicknameLengthClass, "is-long");
  } finally {
    cleanup();
  }
});

test("room page: seating panel keeps a local draft when moving the selected player into an empty seat", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let hapticCalls = 0;
    let sfxCalls = 0;

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

    assert.equal(page.data.seatingDraftPlayers.find((item) => item.id === "guest-b").seatIndex, 5);
    assert.equal(page.data.seatingSelectedSeatIndex, 0);
    assert.equal(page.data.seatingSelectedText, "未选择");
    assert.equal(hapticCalls, 1);
    assert.equal(sfxCalls, 0);
  } finally {
    cleanup();
  }
});

test("room page: owner can reopen seating after settlement", () => {
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
      phase: "ended",
      round: 2,
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
          diceCupStatus: "open",
          rollLocked: true
        },
        {
          id: "guest-b",
          nickname: "二号位玩家",
          avatar: "",
          isOwner: false,
          onlineStatus: "online",
          turnStatus: "idle",
          seatIndex: 2,
          diceCupStatus: "open",
          rollLocked: true
        }
      ]
    });

    page.openSeatingPanel({
      id: "guest-b",
      nickname: "二号位玩家",
      seatIndex: 2
    });

    assert.equal(page.data.seatingVisible, true);
    assert.equal(page.data.seatingSelectedSeatIndex, 2);
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
    let hapticCalls = 0;
    let sfxCalls = 0;

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
      },
      seatingMode: "staging",
      seatingDraftDirection: "cw"
    });

    page.onSeatingSelectDirection({
      currentTarget: {
        dataset: {
          dir: "ccw"
        }
      }
    });

    assert.equal(page.data.seatingDraftDirection, "ccw");
    assert.equal(hapticCalls, 1);
    assert.equal(sfxCalls, 0);
  } finally {
    cleanup();
  }
});

test("room page: seating direction can still be updated after settlement", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.haptic = () => {};
    page.setData({
      phase: "ended",
      round: 3,
      selfIsOwner: true,
      roomConfig: {
        direction: "cw"
      },
      seatingMode: "staging",
      seatingDraftDirection: "cw"
    });

    page.onSeatingSelectDirection({
      currentTarget: {
        dataset: {
          dir: "ccw"
        }
      }
    });

    assert.equal(page.data.seatingDraftDirection, "ccw");
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

test("room page: seating panel swaps two occupied seats inside the local draft", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let hapticCalls = 0;
    let sfxCalls = 0;

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

    assert.equal(page.data.seatingDraftPlayers.find((item) => item.id === "guest-b").seatIndex, 6);
    assert.equal(page.data.seatingDraftPlayers.find((item) => item.id === "guest-c").seatIndex, 2);
    assert.equal(page.data.seatingSelectedSeatIndex, 0);
    assert.equal(page.data.seatingSelectedText, "未选择");
    assert.equal(hapticCalls, 1);
    assert.equal(sfxCalls, 0);
  } finally {
    cleanup();
  }
});

test("room page: stale seating panel refuses to submit after the room leaves setup phases", () => {
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
      phase: "ended",
      selfIsOwner: true,
      playersRaw: [
        { id: "owner-a", nickname: "房主", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "active", seatIndex: 1, diceCupStatus: "open", rollLocked: true },
        { id: "guest-b", nickname: "二号位玩家", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "open", rollLocked: true }
      ]
    });

    page.openSeatingPanel({ id: "guest-b", nickname: "二号位玩家", seatIndex: 2 });
    page.setData({ phase: "calling" });
    page.onTapSeatRow({
      currentTarget: {
        dataset: {
          seat: 5
        }
      }
    });

    assert.equal(page.data.seatingVisible, false);
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

test("room page: tools menu opens the custom audio-and-feedback sheet", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.devtoolsMode = true;
    page.setData({
      selfIsOwner: true,
      phase: "ready",
      round: 0,
      roomConfig: {
        testMode: false
      }
    });

    page.openToolsMenu();

    assert.equal(page.data.toolsBasicVisible, true);
  } finally {
    cleanup();
  }
});

test("room page: tools menu exposes owner tools when waiting players need seats", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let capturedItems = null;

    page.setData({
      selfIsOwner: true,
      phase: "ended",
      round: 2,
      roomConfig: {
        testMode: false
      },
      waitingPlayersRaw: [
        { id: "waiting-a", nickname: "等待者", avatar: "", onlineStatus: "online" }
      ]
    });
    page.showActionSheetSafe = ({ itemList }) => {
      capturedItems = itemList;
    };

    page.openToolsMenu();

    assert.deepEqual(capturedItems, ["音效与反馈", "房主工具"]);
  } finally {
    cleanup();
  }
});

test("room page: room state sync keeps waiting count and spectator state on the table corner model", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({
      playerId: "waiting-a",
      nickname: "旁观者"
    });

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "123456",
        phase: "calling",
        round: 1,
        currentPlayerId: "P1",
        lastCall: null,
        players: [
          { id: "P1", nickname: "甲", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "active", seatIndex: 1, diceCupStatus: "closed", rollLocked: true, rollCountThisRound: 1 },
          { id: "P2", nickname: "乙", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: true, rollCountThisRound: 1 }
        ],
        waitingPlayers: [
          { id: "waiting-a", nickname: "旁观者", avatar: "", onlineStatus: "online" },
          { id: "waiting-b", nickname: "等待二", avatar: "", onlineStatus: "online" }
        ],
        config: {
          direction: "cw",
          dicePerPlayer: 5,
          minOpeningCount: 1,
          themeId: "ruby-red"
        },
        version: 1,
        serverTs: Date.now()
      }
    }));

    assert.equal(page.data.selfIsWaiting, true);
    assert.equal(page.data.waitingPlayerCount, 2);
    assert.equal(page.data.primaryActionText, "待上桌");
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

test("room page: hiding clears settlement countdown before the subpackage frame is gone", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.settlementCountdownTimer = setInterval(() => {}, 1000);

    page.onHide();

    assert.equal(page.pageHidden, true);
    assert.equal(page.settlementCountdownTimer, null);

    page.onShow();

    assert.equal(page.pageHidden, false);
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

test("room page: tapping the self dice cup toggles cover without changing dice values", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const haptics = [];
    page.haptic = (kind) => haptics.push(kind);
    page.setData({
      phase: "calling",
      selfIsWaiting: false,
      myDiceVisible: true,
      myDiceRolling: false,
      myDiceRevealing: false,
      privateDice: [2, 4, 6, 1, 3],
      roomConfig: {
        dicePerPlayer: 5
      },
      roomSelfDiceFaces: [
        { value: 2 },
        { value: 4 },
        { value: 6 },
        { value: 1 },
        { value: 3 }
      ]
    });

    page.toggleSelfDiceCover();
    assert.equal(page.data.myDiceCovered, true);
    assert.deepEqual(page.data.privateDice, [2, 4, 6, 1, 3]);

    page.toggleSelfDiceCover();
    assert.equal(page.data.myDiceCovered, false);
    assert.deepEqual(haptics, ["light", "light"]);
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
          winnerId: "winner",
          countDetails: [
            {
              playerId: "winner",
              contribution: 3,
              straight: false,
              leopardBonus: false,
              dice: [
                { index: 0, value: 4, counted: true, wildcard: false },
                { index: 1, value: 1, counted: false, wildcard: false },
                { index: 2, value: 1, counted: false, wildcard: false },
                { index: 3, value: 4, counted: true, wildcard: false },
                { index: 4, value: 4, counted: true, wildcard: false }
              ]
            },
            {
              playerId: "loser",
              contribution: 6,
              straight: false,
              leopardBonus: true,
              dice: [
                { index: 0, value: 4, counted: true, wildcard: false },
                { index: 1, value: 4, counted: true, wildcard: false },
                { index: 2, value: 4, counted: true, wildcard: false },
                { index: 3, value: 1, counted: true, wildcard: true },
                { index: 4, value: 4, counted: true, wildcard: false }
              ]
            }
          ]
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
    const loserRow = page.data.settlementRows.find((row) => row.playerId === "loser");
    assert.deepEqual(loserRow.featureTags, ["豹4"]);
    assert.equal(loserRow.featureTagText, "豹4");
    assert.equal(loserRow.diceBonusText, "+1");
    assert.equal(loserRow.diceItems.filter((item) => item.highlighted).length, 5);
    assert.equal(loserRow.diceItems.find((item) => item.value === 1).wildcard, true);

    const naturalLeopardOpenResult = {
      ...openResult,
      targets: [
        {
          ...openResult.targets[0],
          countDetails: []
        }
      ]
    };
    const naturalLeopardRoundSummary = {
      ...roundSummary,
      players: [
        { playerId: "winner", dice: [2, 2, 2, 2, 2] },
        { playerId: "loser", dice: [5, 5, 5, 5, 5] }
      ]
    };
    page.showSettlementPanel(naturalLeopardOpenResult, naturalLeopardRoundSummary);
    const naturalWinnerRow = page.data.settlementRows.find((row) => row.playerId === "winner");
    const naturalLoserRow = page.data.settlementRows.find((row) => row.playerId === "loser");
    assert.deepEqual(naturalWinnerRow.featureTags, ["豹2"]);
    assert.deepEqual(naturalLoserRow.featureTags, ["豹5"]);
    assert.equal(naturalWinnerRow.featureTagText, "豹2");
    assert.equal(naturalLoserRow.featureTagText, "豹5");
    assert.equal(naturalWinnerRow.diceBonusText, "");
    assert.equal(naturalLoserRow.diceBonusText, "");
  } finally {
    cleanup();
  }
});

test("room page: settlement lets the owner continue when the loser is offline", () => {
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
    page.data.playerId = "owner";
    page.data.playersRaw = [
      { id: "owner", nickname: "房主", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "open", rollLocked: true },
      { id: "loser", nickname: "输家", avatar: "", isOwner: false, onlineStatus: "offline", turnStatus: "idle", seatIndex: 2, diceCupStatus: "open", rollLocked: true }
    ];

    const openResult = {
      round: 1,
      openerId: "owner",
      targets: [
        {
          targetId: "loser",
          declared: { count: 5, point: 4 },
          actual: 2,
          winnerId: "owner"
        }
      ],
      serverTs: Date.now()
    };

    page.showSettlementPanel(openResult, {
      round: 1,
      roomId: "123456",
      players: [
        { playerId: "owner", dice: [4, 4, 2, 3, 6] },
        { playerId: "loser", dice: [1, 2, 3, 5, 6] }
      ],
      openResult,
      serverTs: Date.now()
    });

    assert.equal(page.data.settlementVisible, true);
    assert.equal(page.data.settlementCanContinue, true);
  } finally {
    cleanup();
  }
});

test("room page: settlement fallback highlights wildcard ones when they are counted", () => {
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
      { id: "owner", nickname: "编号9527", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "closed", rollLocked: true },
      { id: "target", nickname: "编号9527", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: true }
    ];

    const openResult = {
      round: 1,
      openerId: "owner",
      targets: [
        {
          targetId: "target",
          declared: { count: 5, point: 3 },
          actual: 4,
          winnerId: "target"
        }
      ],
      serverTs: Date.now()
    };
    const roundSummary = {
      roomId: "778899",
      round: 1,
      players: [
        { playerId: "owner", nickname: "编号9527", avatar: "", dice: [3, 6, 6, 6, 4], call: null },
        { playerId: "target", nickname: "编号9527", avatar: "", dice: [1, 5, 1, 3, 6], call: { count: 5, point: 3, by: "target", ts: Date.now() } }
      ],
      openResult,
      serverTs: Date.now()
    };

    page.showSettlementPanel(openResult, roundSummary);

    const ownerRow = page.data.settlementRows.find((row) => row.playerId === "owner");
    const targetRow = page.data.settlementRows.find((row) => row.playerId === "target");
    assert.equal(ownerRow.diceItems.filter((item) => item.highlighted).length, 1);
    assert.equal(targetRow.diceItems.filter((item) => item.highlighted).length, 3);
    assert.equal(targetRow.diceItems.filter((item) => item.wildcard).length, 2);
    assert.deepEqual(targetRow.diceItems.map((item) => item.value), [1, 1, 3, 5, 6]);
  } finally {
    cleanup();
  }
});

test("room page: settlement audio follows winner-loser identity instead of continue permission", () => {
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
      { id: "loser", nickname: "输家", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: false },
      { id: "watcher", nickname: "旁观者", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 3, diceCupStatus: "closed", rollLocked: false }
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
        { playerId: "loser", dice: [1, 5, 3, 2, 4] },
        { playerId: "watcher", dice: [2, 2, 3, 4, 6] }
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
    assert.equal(page.data.settlementRows.length, 3);

    page.setData({ settlementVisible: false });
    page.data.playerId = "loser";
    page.showSettlementPanel(openResult, roundSummary);
    assert.deepEqual(sfxCalls, ["settlement", "loseAlert"]);

    page.setData({ settlementVisible: false });
    page.data.playerId = "watcher";
    page.showSettlementPanel(openResult, roundSummary);
    assert.deepEqual(sfxCalls, ["settlement", "loseAlert"]);

    page.setData({ settlementVisible: false });
    page.data.playerId = "winner";
    page.data.playersRaw = [
      { id: "winner", nickname: "赢家", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "closed", rollLocked: false },
      { id: "loser", nickname: "输家", avatar: "", isOwner: false, onlineStatus: "offline", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: false },
      { id: "watcher", nickname: "旁观者", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 3, diceCupStatus: "closed", rollLocked: false }
    ];
    page.showSettlementPanel(openResult, roundSummary);
    assert.deepEqual(sfxCalls, ["settlement", "loseAlert", "settlement"]);
  } finally {
    cleanup();
  }
});

test("room page: settlement continue restarts only from the settlement permission state", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const calls = [];
    page.restartRound = () => {
      calls.push("restart");
    };
    page.hideSettlementPanel = () => {
      calls.push("hide");
    };

    page.setData({
      phase: "ended",
      settlementCanContinue: true,
      canPrimaryAction: false,
      primaryActionText: "等待"
    });
    page.onSettlementContinue();
    assert.deepEqual(calls, ["restart"]);

    page.setData({
      phase: "rolling",
      settlementCanContinue: true
    });
    page.onSettlementContinue();
    assert.deepEqual(calls, ["restart", "hide"]);

    page.setData({
      phase: "ended",
      settlementCanContinue: false
    });
    page.onSettlementContinue();
    assert.deepEqual(calls, ["restart", "hide"]);
  } finally {
    cleanup();
  }
});

test("room page: history list keeps the selected round instead of jumping back to the first card", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.data.playersRaw = [
      { id: "P1", nickname: "甲", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "closed", rollLocked: true },
      { id: "P2", nickname: "乙", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: true }
    ];
    page.data.playerId = "P1";
    page.setData({ historyActiveRound: 2 });

    const buildSummary = (round, winnerId = "P1") => {
      const openResult = {
        round,
        openerId: "P1",
        targets: [
          {
            targetId: "P2",
            declared: { count: 5, point: 3 },
            actual: 4,
            winnerId
          }
        ],
        serverTs: Date.now()
      };
      return {
        round,
        roomId: "123456",
        players: [
          { playerId: "P1", dice: [3, 3, 5, 6, 2], call: null },
          { playerId: "P2", dice: [1, 2, 3, 4, 5], call: { count: 5, point: 3, by: "P2", ts: Date.now() } }
        ],
        openResult,
        serverTs: Date.now()
      };
    };

    page.handleServerPacket(JSON.stringify({
      event: "history:list",
      payload: {
        items: [buildSummary(1), buildSummary(3), buildSummary(2)]
      }
    }));

    assert.deepEqual(page.data.historyItems.map((item) => item.round), [3, 2, 1]);
    assert.equal(page.data.historyActiveRound, 2);
  } finally {
    cleanup();
  }
});

test("room page: opening history always refreshes and keeps the newest three rounds", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sent = [];
    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };

    page.setData({
      historyVisible: false,
      historyItems: [{ round: 1 }, { round: 2 }, { round: 3 }],
      historyActiveRound: 2
    });

    page.toggleHistory();

    assert.equal(page.data.historyVisible, true);
    assert.deepEqual(sent, [{ event: "history:list", payload: { limit: 3 } }]);

    page.data.playersRaw = [
      { id: "P1", nickname: "甲", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "closed", rollLocked: true },
      { id: "P2", nickname: "乙", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "closed", rollLocked: true }
    ];
    page.data.playerId = "P1";

    const buildSummary = (round) => ({
      round,
      roomId: "123456",
      players: [
        { playerId: "P1", dice: [3, 3, 5, 6, 2], call: null },
        { playerId: "P2", dice: [1, 2, 3, 4, 5], call: { count: 5, point: 3, by: "P2", ts: Date.now() } }
      ],
      openResult: {
        round,
        openerId: "P1",
        targets: [
          {
            targetId: "P2",
            declared: { count: 5, point: 3 },
            actual: 4,
            winnerId: "P1"
          }
        ],
        serverTs: Date.now()
      },
      serverTs: Date.now()
    });

    page.handleServerPacket(JSON.stringify({
      event: "history:list",
      payload: {
        items: [buildSummary(1), buildSummary(5), buildSummary(4), buildSummary(3), buildSummary(2)]
      }
    }));

    assert.deepEqual(page.data.historyItems.map((item) => item.round), [5, 4, 3]);
    assert.equal(page.data.historyActiveRound, 5);
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

test("room page: failed voice upload now surfaces a toast instead of failing silently", async () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.actionEventMap = {
      "voice-ack-1": "voice:upload"
    };
    const transcriptPromise = page.waitForVoiceTranscript("voice_req_1").catch((error) => error.message);

    page.handleServerPacket(JSON.stringify({
      event: "action:ack",
      payload: {
        actionId: "voice-ack-1",
        ok: false,
        reason: "语音识别服务暂时不可用"
      }
    }));

    assert.equal(await transcriptPromise, "语音识别服务暂时不可用");
    assert.equal(toasts.includes("语音识别服务暂时不可用"), true);
  } finally {
    cleanup();
  }
});

test("room page: calling-turn room state routes open into the left secondary action when opening is allowed", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({ playerId: "P1" });
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({
        currentPlayerId: "P1",
        lastCall: { count: 3, point: 4, by: "P2", ts: 101 }
      })
    }));
    assert.equal(page.data.showQuickOpenAction, false);
    assert.equal(page.data.secondaryActionKind, "open");
    assert.equal(page.data.secondaryActionText, "开牌");
    assert.equal(page.data.primaryActionText, "叫牌");

    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({
        currentPlayerId: "P1",
        lastCall: null
      })
    }));
    assert.equal(page.data.secondaryActionKind, "");
    assert.equal(page.data.secondaryActionText, "");
  } finally {
    cleanup();
  }
});

test("room page: calling-turn room state hides open action for self-call and one-online-player states", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({ playerId: "P1" });
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({
        currentPlayerId: "P1",
        lastCall: { count: 3, point: 4, by: "P1", ts: 101 }
      })
    }));
    assert.equal(page.data.canOpenAction, false);
    assert.equal(page.data.showQuickOpenAction, false);

    const oneOnlinePayload = buildRoomStatePayload({
      currentPlayerId: "P1",
      lastCall: { count: 3, point: 4, by: "P2", ts: 102 }
    });
    oneOnlinePayload.players = oneOnlinePayload.players.map((player) => (
      player.id === "P2" ? { ...player, onlineStatus: "offline" } : player
    ));
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: oneOnlinePayload
    }));
    assert.equal(page.data.canOpenAction, false);
    assert.equal(page.data.showQuickOpenAction, false);
  } finally {
    cleanup();
  }
});

test("room page: non-turn players can jump-open while the latest caller sees no left action", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({ playerId: "P2" });
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: buildRoomStatePayload({
        currentPlayerId: "P1",
        lastCall: { count: 4, point: 5, by: "P2", ts: 201 }
      })
    }));
    assert.equal(page.data.canOpenAction, false);
    assert.equal(page.data.secondaryActionKind, "");
    assert.equal(page.data.secondaryActionText, "");

    page.setData({ playerId: "P3" });
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        ...buildRoomStatePayload({
          currentPlayerId: "P2",
          lastCall: { count: 4, point: 5, by: "P2", ts: 202 }
        }),
        players: [
          {
            id: "P1",
            nickname: "甲方",
            avatar: "",
            isOwner: true,
            onlineStatus: "online",
            turnStatus: "idle",
            seatIndex: 1,
            diceCupStatus: "closed",
            rollLocked: true,
            rollCountThisRound: 1
          },
          {
            id: "P2",
            nickname: "乙方",
            avatar: "",
            isOwner: false,
            onlineStatus: "online",
            turnStatus: "active",
            seatIndex: 2,
            diceCupStatus: "closed",
            rollLocked: true,
            rollCountThisRound: 1
          },
          {
            id: "P3",
            nickname: "丙方",
            avatar: "",
            isOwner: false,
            onlineStatus: "online",
            turnStatus: "idle",
            seatIndex: 3,
            diceCupStatus: "closed",
            rollLocked: true,
            rollCountThisRound: 1
          }
        ]
      }
    }));
    assert.equal(page.data.canOpenAction, true);
    assert.equal(page.data.secondaryActionKind, "open");
    assert.equal(page.data.secondaryActionText, "跳开");
  } finally {
    cleanup();
  }
});

test("room page: ended state with pending-seat spectators routes restart control to owner seating panel", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let seatingOpened = 0;
    page.openSeatingPanel = () => {
      seatingOpened += 1;
    };
    page.setData({ playerId: "P1" });
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "778899",
        phase: "ended",
        round: 2,
        currentPlayerId: "P2",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 1,
          testMode: false
        },
        players: [
          { id: "P1", nickname: "房主", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "open", rollLocked: true },
          { id: "P2", nickname: "输家", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "active", seatIndex: 2, diceCupStatus: "open", rollLocked: true }
        ],
        waitingPlayers: [
          { id: "W1", nickname: "等待者", avatar: "", onlineStatus: "online", seatIntent: "pendingSeat" }
        ],
        networkHealth: "good",
        version: 3,
        serverTs: Date.now()
      }
    }));

    assert.equal(page.data.primaryActionText, "安排座位");
    assert.equal(page.data.canPrimaryAction, true);
    page.onPrimaryAction();
    assert.equal(seatingOpened, 1);

    page.setData({ playerId: "P2" });
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "778899",
        phase: "ended",
        round: 2,
        currentPlayerId: "P2",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 1,
          testMode: false
        },
        players: [
          { id: "P1", nickname: "房主", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "open", rollLocked: true },
          { id: "P2", nickname: "输家", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "active", seatIndex: 2, diceCupStatus: "open", rollLocked: true }
        ],
        waitingPlayers: [
          { id: "W1", nickname: "等待者", avatar: "", onlineStatus: "online", seatIntent: "pendingSeat" }
        ],
        networkHealth: "good",
        version: 4,
        serverTs: Date.now()
      }
    }));

    assert.equal(page.data.primaryActionText, "等待房主安排");
    assert.equal(page.data.canPrimaryAction, false);
  } finally {
    cleanup();
  }
});

test("room page: offline waiting players do not block the owner start control", () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({ playerId: "P1" });
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "778899",
        phase: "ended",
        round: 2,
        currentPlayerId: "P1",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 1,
          testMode: false
        },
        players: [
          { id: "P1", nickname: "房主", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "active", seatIndex: 1, diceCupStatus: "open", rollLocked: true },
          { id: "P2", nickname: "输家", avatar: "", isOwner: false, onlineStatus: "online", turnStatus: "idle", seatIndex: 2, diceCupStatus: "open", rollLocked: true }
        ],
        waitingPlayers: [
          { id: "W1", nickname: "离线等待者", avatar: "", onlineStatus: "offline", seatIntent: "pendingSeat" }
        ],
        networkHealth: "good",
        version: 5,
        serverTs: Date.now()
      }
    }));

    assert.equal(page.data.waitingPlayerCount, 0);
    assert.equal(page.data.primaryActionText, "开始");
    assert.equal(page.data.canPrimaryAction, true);
  } finally {
    cleanup();
  }
});

test("room page: seating draft can move a spectator onto the first empty seat", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({
      phase: "ended",
      selfIsOwner: true,
      seatingMode: "staging",
      seatingDraftPlayers: [
        { id: "P1", nickname: "房主", avatar: "", isOwner: true, seatIndex: 1 },
        { id: "P2", nickname: "玩家二", avatar: "", isOwner: false, seatIndex: 2 }
      ],
      seatingDraftSpectators: [
        { id: "W1", nickname: "等待者", avatar: "", onlineStatus: "online", seatIntent: "pendingSeat" }
      ]
    });

    page.onTapSeatingDraftSpectatorAction({
      currentTarget: {
        dataset: {
          id: "W1"
        }
      }
    });

    assert.equal(page.data.seatingDraftPlayers.find((item) => item.id === "W1").seatIndex, 3);
    assert.equal(page.data.seatingDraftSpectators.length, 0);
  } finally {
    cleanup();
  }
});

test("room page: seating draft refuses to place a spectator when no seat is free", () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({
      phase: "ended",
      selfIsOwner: true,
      seatingMode: "staging",
      seatingDraftPlayers: Array.from({ length: 8 }, (_, index) => ({
        id: `P${index + 1}`,
        nickname: `玩家${index + 1}`,
        avatar: "",
        isOwner: index === 0,
        seatIndex: index + 1
      })),
      seatingDraftSpectators: [
        { id: "W1", nickname: "等待者", avatar: "", onlineStatus: "online", seatIntent: "pendingSeat" }
      ]
    });

    page.onTapSeatingDraftSpectatorAction({
      currentTarget: {
        dataset: {
          id: "W1"
        }
      }
    });

    assert.equal(page.data.seatingDraftSpectators.length, 1);
    assert.equal(toasts.includes("没有空座位，请先调整桌上玩家"), true);
  } finally {
    cleanup();
  }
});

test("room page: waiting admit compatibility entry just reopens the owner seating panel", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let seatingOpened = 0;
    page.openSeatingPanel = () => {
      seatingOpened += 1;
    };
    page.setData({
      playersRaw: [
        { id: "P1", nickname: "房主", avatar: "", isOwner: true, seatIndex: 1 },
        { id: "P2", nickname: "玩家二", avatar: "", isOwner: false, seatIndex: 2 }
      ],
      waitingPlayersRaw: [
        { id: "W1", nickname: "等待者", avatar: "", onlineStatus: "online", seatIntent: "pendingSeat" }
      ]
    });

    page.openWaitingAdmitFlow();

    assert.equal(seatingOpened, 1);
  } finally {
    cleanup();
  }
});

test("room page: live seating actions update the next-round tags immediately after tapping", () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sent = [];
    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };
    page.socketTask = {
      send() {}
    };
    page.setData({
      connected: true,
      legalAccepted: true,
      phase: "calling",
      playerId: "P1",
      selfIsOwner: true,
      seatingMode: "live",
      ownerSeatingRequired: false,
      playersRaw: [
        { id: "P1", nickname: "房主", avatar: "", isOwner: true, onlineStatus: "online", seatIndex: 1, pendingBench: false },
        { id: "P2", nickname: "玩家二", avatar: "", isOwner: false, onlineStatus: "online", seatIndex: 2, pendingBench: false }
      ],
      waitingPlayersRaw: [
        { id: "W1", nickname: "等待者", avatar: "", onlineStatus: "online", seatIntent: "spectating" }
      ]
    });

    page.onTapSeatingLiveAction({
      currentTarget: {
        dataset: {
          id: "P2",
          target: "bench"
        }
      }
    });

    assert.deepEqual(sent, [{
      event: "room:participant:plan",
      payload: {
        playerId: "P2",
        target: "bench"
      }
    }]);
    assert.equal(page.data.seatingLivePlayers.find((item) => item.id === "P2").tagText, "下局旁观");
    assert.equal(page.data.seatingLivePlayers.find((item) => item.id === "P2").actionText, "保持在桌");
    assert.equal(page.data.seatingLivePendingCount, 1);
    assert.equal(toasts.at(-1), "已设为下局旁观");
  } finally {
    cleanup();
  }
});

test("room page: ended room state lets owner start when the loser starter is offline", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({ playerId: "P1" });
    page.handleServerPacket(JSON.stringify({
      event: "room:state",
      payload: {
        roomId: "778899",
        phase: "ended",
        round: 2,
        currentPlayerId: "P2",
        config: {
          direction: "cw",
          wildcardOneEnabled: true,
          openMode: "single",
          dicePerPlayer: 5,
          minOpeningCount: 1,
          testMode: false
        },
        players: [
          { id: "P1", nickname: "房主", avatar: "", isOwner: true, onlineStatus: "online", turnStatus: "idle", seatIndex: 1, diceCupStatus: "open", rollLocked: true },
          { id: "P2", nickname: "输家", avatar: "", isOwner: false, onlineStatus: "offline", turnStatus: "idle", seatIndex: 2, diceCupStatus: "open", rollLocked: true }
        ],
        waitingPlayers: [],
        networkHealth: "good",
        version: 3,
        serverTs: Date.now()
      }
    }));

    assert.equal(page.data.primaryActionText, "开始");
    assert.equal(page.data.canPrimaryAction, true);
  } finally {
    cleanup();
  }
});

test("room page: quick open action reuses the open flow without reopening the call panel", () => {
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
    const sent = [];
    page.playSfx = (kind) => {
      sfxCalls.push(kind);
    };
    page.haptic = (kind) => {
      haptics.push(kind);
    };
    page.sendEvent = (event, payload) => {
      sent.push({ event, payload });
    };
    page.setData({
      phase: "calling",
      currentPlayerId: "player-a",
      playerId: "player-a",
      selfIsWaiting: false,
      canOpenAction: true,
      callPanelVisible: false,
      callPanelExpanded: false
    });

    page.openDice();

    assert.deepEqual(haptics, ["light"]);
    assert.deepEqual(sfxCalls, ["open"]);
    assert.deepEqual(sent, [{ event: "open:request", payload: {} }]);
    assert.equal(page.data.callPanelVisible, false);
    assert.equal(page.data.callPanelExpanded, false);
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
      callCountTouched: true,
      callPointTouched: true,
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

test("room page: manual call options block selections below the previous hand", () => {
  const { page, toasts, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    const sent = [];
    page.haptic = () => {};
    page.playSfx = () => {};
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
      callCountTouched: true,
      callPointTouched: true,
      lastCallObj: { count: 4, point: 5, by: "other", ts: 101 },
      roomConfig: { minOpeningCount: 3, dicePerPlayer: 5, direction: "cw" },
      playersRaw: [
        { id: "player-a", seatIndex: 1, diceCupStatus: "closed" },
        { id: "player-b", seatIndex: 2, diceCupStatus: "closed" }
      ],
      callPointOptions: ["1", "2", "3", "4", "5", "6"]
    });

    page.onSelectCallPointOption({
      currentTarget: {
        dataset: {
          value: "4"
        }
      }
    });
    assert.equal(page.data.callPoint, "5");

    page.setData({
      callCount: "4",
      callPoint: "4",
      callSelectionLegal: page.isCallSelectionLegal(4, 4)
    });
    page.makeCallWithInput();

    assert.deepEqual(sent, []);
    assert.equal(toasts.at(-1), "叫牌必须严格大于上一手");
  } finally {
    cleanup();
  }
});

test("room page: call count options stay enabled when another point makes that count legal", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    page.setData({
      phase: "calling",
      currentPlayerId: "player-a",
      playerId: "player-a",
      selfIsWaiting: false,
      callForcedOpen: false,
      callPanelVisible: true,
      callPanelExpanded: true,
      callCount: "8",
      callPoint: "5",
      callCountTouched: true,
      callPointTouched: true,
      lastCallObj: { count: 7, point: 5, by: "other", ts: 101 },
      roomConfig: { minOpeningCount: 3, dicePerPlayer: 5, direction: "cw" },
      playersRaw: [
        { id: "player-a", seatIndex: 1, diceCupStatus: "closed" },
        { id: "player-b", seatIndex: 2, diceCupStatus: "closed" }
      ],
      callPointOptions: ["1", "2", "3", "4", "5", "6"]
    });

    page.setData({
      callCountOptions: page.buildCallCountOptions(8, 10, 5)
    });

    assert.equal(page.data.callCountOptions.find((item) => item.value === "6").disabled, true);
    assert.equal(page.data.callCountOptions.find((item) => item.value === "7").disabled, false);

    page.onSelectCallCountOption({
      currentTarget: {
        dataset: {
          value: "7"
        }
      }
    });

    assert.equal(page.data.callCount, "7");
    assert.equal(page.data.callPoint, "6");
    assert.equal(page.data.callSelectionLegal, true);
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
