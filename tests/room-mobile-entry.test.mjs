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

test("room page: mobile join with loopback ws stays on the room shell and prompts for ws config", () => {
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
    assert.equal(page.data.networkStatusText, "请修改地址");
    assert.match(page.data.wsHintText, /手机真机无法访问 127\.0\.0\.1/);
    assert.ok(toasts.includes("请先改成局域网IP或wss地址"));
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
    assert.equal(page.data.pendingActionText, "连接成功后将自动加入房间 654321");
    assert.equal(page.data.networkStatusText, "请修改地址");
    assert.match(page.data.wsHintText, /手机真机无法访问 127\.0\.0\.1/);
    assert.deepEqual(storageState[LEGAL_ACCEPT_KEY].accepted, true);
    assert.ok(toasts.includes("请先改成局域网IP或wss地址"));
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
    assert.equal(sfxCalls, 1);
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
    assert.equal(sfxCalls, 1);
  } finally {
    cleanup();
  }
});

test("room page: owner ready menu exposes seating setup and opens the seating panel", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let capturedItems = null;
    let opened = 0;

    page.setData({
      selfIsOwner: true,
      phase: "ready",
      round: 0
    });
    page.showActionSheetSafe = ({ itemList, success }) => {
      capturedItems = itemList;
      success({ tapIndex: 0 });
    };
    page.openSeatingPanel = () => {
      opened += 1;
    };

    page.onTapMore();

    assert.deepEqual(capturedItems, ["排位设置", "设置", "离开房间"]);
    assert.equal(opened, 1);
  } finally {
    cleanup();
  }
});

test("room page: non-owner menu skips seating setup", () => {
  const { page, cleanup } = instantiateRoomPage({
    storage: {
      [LEGAL_ACCEPT_KEY]: { accepted: true },
      [NICKNAME_KEY]: "手机玩家"
    },
    appWsUrl: "ws://192.168.1.23:3000/ws"
  });

  try {
    let capturedItems = null;
    let toolsOpened = 0;
    let seatingOpened = 0;

    page.setData({
      selfIsOwner: false,
      phase: "ready",
      round: 0
    });
    page.showActionSheetSafe = ({ itemList, success }) => {
      capturedItems = itemList;
      success({ tapIndex: 0 });
    };
    page.openToolsMenu = () => {
      toolsOpened += 1;
    };
    page.openSeatingPanel = () => {
      seatingOpened += 1;
    };

    page.onTapMore();

    assert.deepEqual(capturedItems, ["设置", "离开房间"]);
    assert.equal(toolsOpened, 1);
    assert.equal(seatingOpened, 0);
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
