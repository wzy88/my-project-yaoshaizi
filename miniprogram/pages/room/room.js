const app = getApp();
const {
  LEGAL_ACCEPT_KEY,
  WS_URL_KEY,
  CLOUD_ENV_ID_KEY,
  CLOUD_SERVICE_KEY,
  CLOUD_WS_PATH_KEY,
  SESSION_KEY,
  NICKNAME_KEY,
  AVATAR_URL_KEY,
  SFX_ENABLED_KEY,
  HAPTIC_ENABLED_KEY
} = require("../../utils/constants");
const { DEFAULT_3D_DIE_ASSET, SELF_DICE_PLACEHOLDER, getDieAsset } = require("../../utils/dice-assets");
const { getStoredAccountSession } = require("../../utils/account-api");
const {
  DEFAULT_CONTAINER_WS_PATH,
  normalizeContainerConfig,
  resolveContainerConfig,
  hasContainerService,
  buildContainerSummary,
  canUseCloudSocketApi,
  initMiniProgramCloud
} = require("../../utils/cloud-container");
const { isDevtoolsPlatform, getNavigationSafeArea } = require("../../utils/system-info");
const ROOM_ASSETS = {
  avatarA: "/assets/figma-room-v2/39b17e1f-9114-410f-85d5-2e5a189fbf74.svg",
  avatarB: "/assets/figma-room-v2/7ca66ac8-3c55-4b22-ae77-b2bf38f68295.svg",
  avatarC: "/assets/figma-room-v2/c34dc9c6-7896-4b4d-adbe-c1e0c86f2471.svg",
  avatarD: "/assets/figma-room-v2/210fcfda-928e-4840-a3e3-173c823b96b8.svg",
  avatarE: "/assets/figma-room-v2/fae378fc-f9e8-496b-a6c8-fee07102a3e1.svg",
  avatarF: "/assets/figma-room-v2/bf7e06ef-5ad9-474e-b2b3-6bbd604fb91f.svg"
};
const ROOM_AUDIO_ASSETS = {
  roll: "/assets/audio/dice-roll.mp3",
  settlement: "/assets/audio/settlement.mp3",
  primary: "/assets/audio/primary-action.mp3",
  roundStart: "/assets/audio/round-start.mp3"
};

function buildAccountAuthPayload() {
  const session = getStoredAccountSession();
  if (!session.loggedIn) {
    return {};
  }

  return {
    accountId: session.accountId,
    accountSessionToken: session.sessionToken
  };
}

function buildSelfDiceFallback(count = SELF_DICE_PLACEHOLDER.length) {
  const size = Number(count);
  const expected = Number.isInteger(size) && size > 0 ? size : SELF_DICE_PLACEHOLDER.length;
  return Array.from({ length: expected }, (_, index) => SELF_DICE_PLACEHOLDER[index % SELF_DICE_PLACEHOLDER.length]);
}

function buildSelfCupDieItem(value, index, revealed = true) {
  return {
    value: Number(value) || 0,
    asset: getDieAsset(value),
    stackClass: `stack-${index % 5}`,
    motionClass: `motion-${index % 5}`,
    revealed: Boolean(revealed)
  };
}

function buildSelfDiceDisplayItems() {
  return Array.from({ length: 5 }, (_, index) => ({
    ...buildSelfCupDieItem(0, index, false),
    asset: DEFAULT_3D_DIE_ASSET
  }));
}

function buildDiceFaceItems(values) {
  return (Array.isArray(values) ? values : []).map((value, index) => buildSelfCupDieItem(value, index, true));
}

function isSelfRollSlotRevealed(slotIndex, revealCount) {
  const count = Math.max(0, Number(revealCount) || 0);
  return ROOM_SELF_REVEAL_ORDER.slice(0, count).includes(slotIndex);
}

function buildSelfRollDisplayItems({ count = 5, finalDice = [], revealCount = 0 }) {
  const size = Math.max(1, Number(count) || 5);
  const rollingValues = buildRandomDiceValues(size);

  return Array.from({ length: size }, (_, index) => {
    const finalValue = Number(finalDice[index]) || 0;
    const revealed = finalValue >= 1 && finalValue <= 6 && isSelfRollSlotRevealed(index, revealCount);
    return buildSelfCupDieItem(revealed ? finalValue : rollingValues[index], index, revealed);
  });
}

function buildSettlementDiceItems(values, highlightValue = 0) {
  return (Array.isArray(values) ? values : []).map((value, index) => {
    const num = Number(value) || 0;
    return {
      value: num,
      asset: getDieAsset(num),
      highlighted: num === Number(highlightValue || 0),
      index
    };
  });
}

const FIGMA_DEFAULT_AVATARS = [
  ROOM_ASSETS.avatarA,
  ROOM_ASSETS.avatarB,
  ROOM_ASSETS.avatarC,
  ROOM_ASSETS.avatarD,
  ROOM_ASSETS.avatarE,
  ROOM_ASSETS.avatarF
];

function getSeatAvatarFallback(index) {
  const size = FIGMA_DEFAULT_AVATARS.length || 1;
  const normalizedIndex = Math.abs(Number(index) || 0) % size;
  return FIGMA_DEFAULT_AVATARS[normalizedIndex] || "";
}

function getSeatAvatarPresentation(avatarSrc, fallbackIndex) {
  const fallback = getSeatAvatarFallback(fallbackIndex);
  const resolved = String(avatarSrc || "").trim() || fallback;
  const isLocalAsset = resolved.startsWith("/assets/");

  return {
    src: resolved,
    mode: isLocalAsset ? "aspectFit" : "aspectFill",
    fitClass: isLocalAsset ? "seat__avatar--fit" : "seat__avatar--photo"
  };
}

const MAX_ROLLS_PER_ROUND = 5;
const ROOM_SELF_ROLLING_FRAME_MS = 90;
const ROOM_SELF_ROLLING_DURATION_MS = 1152;
const ROOM_SELF_REVEAL_STAGGER_MS = 84;
const ROOM_SELF_REVEAL_SETTLE_MS = 1200;
const ROOM_SELF_REVEAL_ORDER = [1, 3, 0, 4, 2, 5, 6, 7, 8, 9];

const DICE_FACE_SYMBOLS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function hasSelfRollsRemaining(data) {
  return (Number(data && data.selfRollCountThisRound) || 0) < MAX_ROLLS_PER_ROUND;
}

function resolveSeatCupToneClass(player) {
  const status = player && player.diceCupStatus;
  return status === "open" ? "is-jade" : "is-slot";
}

function buildActionId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeHistoryItems(items) {
  return (items || []).map((item) => {
    const openResult = item && item.openResult ? item.openResult : {};
    const openerShortId = String(openResult.openerId || "").slice(0, 8);
    const resultText = (Array.isArray(openResult.targets) ? openResult.targets : [])
      .map((target) => {
        const targetShortId = String(target.targetId || "").slice(0, 8);
        const winnerShortId = String(target.winnerId || "").slice(0, 8);
        return `${targetShortId}:${target.declared.count}个${target.declared.point}/实${target.actual}/胜${winnerShortId}`;
      })
      .join(" | ");

    return {
      ...item,
      openerShortId,
      resultText: resultText || "-"
    };
  });
}

function buildSettlementViewModel({ openResult, roundSummary, playersRaw, selfPlayerId }) {
  const result = openResult && typeof openResult === "object" ? openResult : null;
  const first = result && Array.isArray(result.targets) ? result.targets[0] : null;
  if (!result || !first || !first.declared) {
    return null;
  }

  const players = Array.isArray(playersRaw) ? playersRaw : [];
  const playerMap = new Map(players.map((p) => [String(p.id || ""), p]));
  const summaryPlayers = roundSummary && Array.isArray(roundSummary.players) ? roundSummary.players : [];
  const summaryDiceMap = new Map(
    summaryPlayers.map((p) => [String(p.playerId || ""), Array.isArray(p.dice) ? p.dice : []])
  );

  const getPlayerName = (playerId) => {
    const id = String(playerId || "");
    const player = playerMap.get(id);
    if (player) {
      const nickname = safeDecodeComponent(player.nickname).trim();
      if (nickname) return nickname;
    }
    return id.slice(0, 6) || "玩家";
  };

  const getSeatIndex = (playerId) => {
    const id = String(playerId || "");
    const player = playerMap.get(id);
    const seat = Number(player && player.seatIndex);
    if (Number.isInteger(seat) && seat > 0) return seat;
    return 99;
  };

  const winnerId = String(first.winnerId || "");
  const openerId = String(result.openerId || "");
  const targetId = String(first.targetId || "");
  const loserId = winnerId && targetId
    ? (winnerId === targetId ? openerId : targetId)
    : "";
  const declaredCount = Number(first.declared.count) || 0;
  const declaredPoint = Number(first.declared.point) || 1;
  const declaredFace = DICE_FACE_SYMBOLS[declaredPoint] || String(declaredPoint || "");
  const actualCount = Number(first.actual) || 0;

  const summaryIds = summaryPlayers
    .map((p) => String(p.playerId || ""))
    .filter(Boolean);
  const ids = [...new Set([
    ...summaryIds,
    winnerId,
    loserId,
    targetId,
    openerId
  ].filter(Boolean))];

  const rows = ids.map((id) => {
    const player = playerMap.get(id);
    const name = getPlayerName(id);
    const displayName = id === String(selfPlayerId || "") ? `${name}（本人）` : name;
    const dice = (summaryDiceMap.get(id) || [])
      .map((num) => Number(num))
      .filter((num) => Number.isInteger(num) && num >= 1 && num <= 6);
    let kind = "neutral";
    let tagText = "";
    let deltaText = "+0";
    let deltaClass = "neutral";

    if (id === winnerId) {
      kind = "winner";
      tagText = "胜";
      deltaText = "🏆 +1";
      deltaClass = "winner";
    } else if (id === loserId) {
      kind = "loser";
      tagText = "负";
      deltaText = "💀 -1";
      deltaClass = "loser";
    }

    return {
      playerId: id,
      name: displayName,
      avatarUrl: player ? String(player.avatar || "") : "",
      avatarText: String(name || "玩").slice(0, 1),
      diceItems: buildSettlementDiceItems(dice, declaredPoint),
      kind,
      tagText,
      deltaText,
      deltaClass,
      scoreClass: deltaClass,
      seatSort: getSeatIndex(id)
    };
  }).sort((a, b) => {
    const rank = { winner: 0, loser: 1, neutral: 2 };
    const rankA = rank[a.kind] == null ? 99 : rank[a.kind];
    const rankB = rank[b.kind] == null ? 99 : rank[b.kind];
    if (rankA !== rankB) return rankA - rankB;
    if (a.seatSort !== b.seatSort) return a.seatSort - b.seatSort;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return {
    summaryText: `【${getPlayerName(openerId)}】 开 【${getPlayerName(targetId)}】`,
    declaredText: `${declaredCount}个`,
    actualText: `${actualCount}个`,
    pointAsset: getDieAsset(declaredPoint),
    rows,
    loserId
  };
}

function normalizeRoomId(roomId) {
  const digits = String(roomId || "").trim();
  return /^\d{6}$/.test(digits) ? digits : "";
}

function formatRoomIdDisplay(roomId) {
  const digits = normalizeRoomId(roomId);
  if (!digits) {
    return "------";
  }
  return digits;
}

function getSeatRadius(playerCount) {
  if (playerCount <= 2) return 44;
  if (playerCount <= 4) return 42;
  if (playerCount <= 6) return 40;
  if (playerCount <= 8) return 40;
  if (playerCount <= 10) return 41;
  return 42;
}

function getSeatGeometry(seatIndex, seatCount = 8) {
  const preset = {
    1: { x: 50.0, y: 19.5, bx: 50.0, by: 27.5 },
    2: { x: 70.2, y: 30.5, bx: 64.6, by: 36.6 },
    3: { x: 81.8, y: 49.0, bx: 73.6, by: 49.2 },
    4: { x: 70.0, y: 68.0, bx: 64.6, by: 63.2 },
    5: { x: 50.0, y: 78.5, bx: 50.0, by: 71.2 },
    6: { x: 30.0, y: 68.0, bx: 35.4, by: 63.2 },
    7: { x: 18.2, y: 49.0, bx: 26.4, by: 49.2 },
    8: { x: 29.8, y: 30.5, bx: 35.4, by: 36.6 }
  };

  if (preset[seatIndex]) {
    return preset[seatIndex];
  }

  const step = (Math.PI * 2) / seatCount;
  const startAngle = -Math.PI / 2;
  const radiusX = getSeatRadius(seatCount);
  const radiusY = radiusX * 0.84;
  const angle = startAngle + (seatIndex - 1) * step;
  const seatX = 50 + radiusX * Math.cos(angle);
  const seatY = 50 + radiusY * Math.sin(angle);
  const bubbleX = 50 + (radiusX - 8) * Math.cos(angle);
  const bubbleY = 50 + (radiusY - 8) * Math.sin(angle);

  return { x: seatX, y: seatY, bx: bubbleX, by: bubbleY };
}

function getStitchSeatLayout(playerCount) {
  const figmaShellSlots = [
    { x: 187.5, y: 168, bx: 240, by: 180, cupX: 187.5, cupY: 220, cupAlign: "bottom", slotClass: "slot-top" },
    { x: 42, y: 290, bx: 84, by: 250, cupX: 102, cupY: 290, cupAlign: "right", slotClass: "slot-upper-left" },
    { x: 333, y: 290, bx: 291, by: 250, cupX: 273, cupY: 290, cupAlign: "left", slotClass: "slot-upper-right" },
    { x: 30, y: 420, bx: 78, by: 380, cupX: 102, cupY: 396, cupAlign: "right", slotClass: "slot-mid-left" },
    { x: 345, y: 420, bx: 297, by: 380, cupX: 273, cupY: 396, cupAlign: "left", slotClass: "slot-mid-right" },
    { x: 44, y: 556, bx: 92, by: 516, cupX: 102, cupY: 526, cupAlign: "right", slotClass: "slot-lower-left" },
    { x: 331, y: 556, bx: 283, by: 516, cupX: 273, cupY: 526, cupAlign: "left", slotClass: "slot-lower-right" },
    { x: 187.5, y: 804, bx: 187.5, by: 736, cupX: 187.5, cupY: 734, cupAlign: "top", slotClass: "slot-bottom" }
  ];

  const layouts = {
    1: {
      selfSlotIndex: 7,
      occupiedSlotIndicesMap: {
        1: [7]
      },
      slots: figmaShellSlots
    },
    2: {
      selfSlotIndex: 7,
      occupiedSlotIndicesMap: {
        2: [0, 7]
      },
      slots: figmaShellSlots
    },
    3: {
      selfSlotIndex: 7,
      occupiedSlotIndicesMap: {
        3: [0, 1, 7]
      },
      slots: figmaShellSlots
    },
    4: {
      selfSlotIndex: 7,
      occupiedSlotIndicesMap: {
        4: [0, 1, 2, 7]
      },
      slots: figmaShellSlots
    },
    5: {
      selfSlotIndex: 7,
      occupiedSlotIndicesMap: {
        5: [0, 1, 2, 3, 7]
      },
      slots: figmaShellSlots
    },
    6: {
      selfSlotIndex: 7,
      occupiedSlotIndicesMap: {
        6: [0, 1, 2, 3, 4, 7]
      },
      slots: figmaShellSlots
    },
    7: {
      selfSlotIndex: 7,
      occupiedSlotIndicesMap: {
        7: [0, 1, 2, 3, 4, 5, 7]
      },
      slots: figmaShellSlots
    },
    8: {
      selfSlotIndex: 7,
      occupiedSlotIndicesMap: {
        8: [0, 1, 2, 3, 4, 5, 6, 7]
      },
      slots: figmaShellSlots
    }
  };

  return layouts[Math.max(1, Math.min(8, Number(playerCount) || 1))] || layouts[8];
}

function rotatePlayersForDisplay(sortedPlayers, selfPlayerId, targetIndex) {
  const list = Array.isArray(sortedPlayers) ? sortedPlayers : [];
  const desiredIndex = Number(targetIndex);
  if (!list.length || !Number.isInteger(desiredIndex) || desiredIndex < 0 || desiredIndex >= list.length) {
    return list;
  }

  const selfIndex = list.findIndex((player) => String(player.id || "") === String(selfPlayerId || ""));
  if (selfIndex < 0) {
    return list;
  }

  const startIndex = (selfIndex - desiredIndex + list.length) % list.length;
  return Array.from({ length: list.length }, (_, idx) => list[(startIndex + idx) % list.length]);
}

function buildGhostSeats(playersDecorated, playerCount) {
  const layout = getStitchSeatLayout(playerCount);
  if (!layout || !Array.isArray(layout.slots)) {
    return [];
  }

  const usedSlots = new Set((playersDecorated || []).map((item) => Number(item.visualSlotIndex)));
  return layout.slots
    .map((slot, index) => ({ ...slot, visualSlotIndex: index }))
    .filter((slot, index) => !usedSlots.has(index) && index !== layout.selfSlotIndex)
    .map((slot) => ({
      visualSlotIndex: slot.visualSlotIndex,
      slotClass: slot.slotClass || "",
      cupStyle: `left:${designPxToRpx(slot.cupX != null ? Number(slot.cupX) : Number(slot.x))};top:${designPxToRpx(slot.cupY != null ? Number(slot.cupY) : Number(slot.y))};`,
      avatarAsset: getSeatAvatarFallback(slot.visualSlotIndex),
      avatarStyle: `left:${designPxToRpx(slot.x)};top:${designPxToRpx(slot.y)};`
    }));
}

function buildCallPointOptionItems(options) {
  return (Array.isArray(options) ? options : []).map((value) => ({
    value: String(value),
    asset: getDieAsset(value)
  }));
}

function clampToRange(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function buildRandomDiceValues(count = 5) {
  const size = Math.max(1, Number(count) || 5);
  return Array.from({ length: size }, () => Math.floor(Math.random() * 6) + 1);
}

function buildCallCountOptionItems(currentValue, maxValue = 1, minValue = 1) {
  const max = Math.max(1, Number(maxValue) || 1);
  const min = Math.max(1, Math.min(Number(minValue) || 1, max));
  const current = clampToRange(currentValue, min, max);
  const windowSize = 7;

  let start = current;
  if (start + windowSize - 1 > max) {
    start = Math.max(min, max - windowSize + 1);
  }

  const list = [];
  for (let value = start; value <= max && list.length < windowSize; value += 1) {
    const isTail = list.length === windowSize - 1 && value < max;
    list.push({
      value: String(value),
      label: isTail ? `${value}+` : String(value),
      isTail
    });
    if (isTail) {
      break;
    }
  }

  if (!list.length) {
    list.push({
      value: String(min),
      label: String(min),
      isTail: false
    });
  }

  return list;
}

function buildSuggestedCallState(lastCall, minOpeningCount, maxCallCount, currentPoint = 6) {
  const max = Math.max(1, Number(maxCallCount) || 1);
  const min = Math.max(1, Math.min(Number(minOpeningCount) || 1, max));
  const fallbackPoint = clampToRange(currentPoint, 1, 6);

  if (!lastCall) {
    return {
      count: min,
      point: fallbackPoint,
      forcedOpen: false
    };
  }

  let nextCount = Number(lastCall.count);
  let nextPoint = Number(lastCall.point);
  if (!Number.isInteger(nextCount) || !Number.isInteger(nextPoint)) {
    return {
      count: min,
      point: fallbackPoint,
      forcedOpen: false
    };
  }

  if (nextCount === max && nextPoint === 6) {
    return {
      count: nextCount,
      point: nextPoint,
      forcedOpen: true
    };
  }

  if (nextPoint < 6) {
    nextPoint += 1;
  } else {
    nextCount += 1;
    nextPoint = 2;
  }

  if (nextCount > max) {
    return {
      count: max,
      point: 6,
      forcedOpen: true
    };
  }

  return {
    count: nextCount,
    point: nextPoint,
    forcedOpen: false
  };
}

function getOccupiedSlotIndices(layout, playerCount) {
  if (!layout || !layout.occupiedSlotIndicesMap) {
    return [];
  }

  const count = Math.max(1, Math.min(8, Number(playerCount) || 0));
  return layout.occupiedSlotIndicesMap[count] || layout.occupiedSlotIndicesMap[8] || [];
}

function safeDecodeComponent(raw) {
  const value = String(raw || "");
  if (!value) return "";
  if (!/%[0-9a-fA-F]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function buildRoomJoinUrl(roomId) {
  const normalizedRoomId = String(roomId || "").trim();
  if (!normalizedRoomId) {
    return "/pages/lobby/lobby";
  }
  return `/pages/room/room?mode=join&forceNew=1&roomId=${encodeURIComponent(normalizedRoomId)}`;
}

function buildRoomShareEntryUrl(roomId) {
  return `/pages/lobby/lobby?redirect=${encodeURIComponent(buildRoomJoinUrl(roomId))}`;
}

function clampPercent(value, min = 0, max = 100) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function designPxToRpx(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0rpx";
  return `${(num * 2).toFixed(2)}rpx`;
}

function px(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0px";
  return `${Math.max(0, Math.round(num))}px`;
}

function buildRoomSafeAreaStyles() {
  const nav = getNavigationSafeArea();
  const topInset = Math.max(0, Number(nav.topInset) || 0);
  const bottomInset = Math.max(0, Number(nav.bottomInset) || 0);
  const topbarButtonSize = 68;
  const roomLabelHeight = 24;
  const menuTop = Math.max(topInset + 8, Number(nav.menuTop) || 0);
  const roomLabelTopOffset = Math.round((topbarButtonSize - roomLabelHeight) / 6);

  return {
    roomShellStyle: `padding-top:${px(Math.max(16, topInset + 8))};`,
    roomTopbarCornerStyle: `margin-top:${px(menuTop)};`,
    roomTopbarCenterStyle: `top:${px(Math.max(menuTop + roomLabelTopOffset, topInset + 18))};`,
    roomBottomFadeStyle: `top:auto;bottom:${px(Math.max(bottomInset + 16, 16))};`,
    roomSelfStyle: `bottom:${px(Math.max(72, bottomInset + 72))};`,
    callPhaseOverlayStyle: ""
  };
}

function decoratePlayers(playersRaw, selfPlayerId, selectedTargetIds, latestCall, direction = "cw") {
  const sorted = [...(playersRaw || [])].sort((a, b) => a.seatIndex - b.seatIndex);
  const selectedSet = new Set(selectedTargetIds || []);
  const latestCallerId = latestCall && typeof latestCall === "object" ? String(latestCall.by || "") : "";
  const layout = getStitchSeatLayout(sorted.length);
  const occupiedSlotIndices = getOccupiedSlotIndices(layout, sorted.length);
  const glowClasses = ["glow-gold", "glow-violet", "glow-gold", "glow-amber", "glow-gold", "glow-violet", "glow-gold"];
  const sourcePlayers = String(direction || "").toLowerCase() === "ccw"
    ? [...sorted].reverse()
    : sorted;
  const targetOrderIndex = occupiedSlotIndices.indexOf(layout ? layout.selfSlotIndex : -1);
  const orderedPlayers = layout
    ? rotatePlayersForDisplay(sourcePlayers, selfPlayerId, targetOrderIndex >= 0 ? targetOrderIndex : sorted.length - 1)
    : sourcePlayers;
  const seatCount = layout ? layout.slots.length : 8;

  return orderedPlayers.map((player, displayIndex) => {
    const rawSeat = Number(player.seatIndex);
    const seatIndex = Number.isInteger(rawSeat) ? Math.max(1, Math.min(seatCount, rawSeat)) : 1;
    const slotIndex = layout ? occupiedSlotIndices[displayIndex] : displayIndex;
    const geometry = layout ? layout.slots[slotIndex] : getSeatGeometry(seatIndex, seatCount);
    const { x: seatX, y: seatY, bx: bubbleX, by: bubbleY } = geometry;

    const borderClass = [];
    if (player.onlineStatus === "offline") {
      borderClass.push("offline");
    } else {
      if (player.id === selfPlayerId) {
        borderClass.push("self");
      }
      if (player.turnStatus === "active") {
        borderClass.push("active");
      }
    }
    if (!borderClass.length) {
      borderClass.push("ready");
    }

    const nicknameDecoded = safeDecodeComponent(player.nickname).trim() || "玩家";
    const cupAlign = geometry.cupAlign || "left";

    const bubbleClass = [];
    if (latestCallerId && String(player.id || "") === latestCallerId) {
      bubbleClass.push("latest");
    }
    const isLatestCall = latestCallerId && String(player.id || "") === latestCallerId;
    const callCount = player.currentCall ? String(Number(player.currentCall.count) || "") : "";
    const callPoint = player.currentCall ? String(Number(player.currentCall.point) || "") : "";
    const isSelf = String(player.id || "") === String(selfPlayerId || "");
    const isHeroSlot = geometry.slotClass === "slot-top";
    const avatarPresentation = getSeatAvatarPresentation(player.avatar, slotIndex);

    return {
      ...player,
      shortId: String(player.id || "").slice(0, 8),
      nicknameShort: nicknameDecoded.slice(0, 5),
      avatarText: nicknameDecoded.slice(0, 1) || "玩",
      callText: player.currentCall ? `${player.currentCall.count}个${player.currentCall.point}` : "",
      displayAvatar: avatarPresentation.src,
      avatarMode: avatarPresentation.mode,
      avatarFitClass: avatarPresentation.fitClass,
      bubbleTextClass: player.id === selfPlayerId ? "warm" : "cool",
      cupAlign,
      showCup: !isSelf,
      cupToneClass: resolveSeatCupToneClass(player),
      cupStageStyle: `left:${designPxToRpx(geometry.cupX != null ? Number(geometry.cupX) : Number(seatX))};top:${designPxToRpx(geometry.cupY != null ? Number(geometry.cupY) : Number(seatY))};`,
      glowClass: isSelf ? "glow-self" : glowClasses[slotIndex % glowClasses.length],
      isSelf,
      isHeroSlot,
      seatStyle: `left:${designPxToRpx(seatX)};top:${designPxToRpx(seatY)};`,
      bubbleStyle: `left:${designPxToRpx(bubbleX)};top:${designPxToRpx(bubbleY)};`,
      bubbleClass: bubbleClass.join(" "),
      bubbleSlotClass: geometry.slotClass || "",
      borderClass: borderClass.join(" "),
      seatSlotClass: geometry.slotClass || "",
      visualSlotIndex: layout ? slotIndex : displayIndex,
      isLatestCall,
      callCount,
      callPoint,
      callPointAsset: getDieAsset(callPoint),
      canSelect: player.id !== selfPlayerId,
      selected: selectedSet.has(player.id)
    };
  });
}

function buildSeatRows(playersRaw, maxSeats = 8, selectedSeatIndex = 0) {
  const players = Array.isArray(playersRaw) ? playersRaw : [];
  const seatMap = new Map(
    players.filter((p) => Number.isInteger(p.seatIndex)).map((p) => [p.seatIndex, p])
  );

  const selectedSeat = Number(selectedSeatIndex);
  const selectedOccupant = Number.isInteger(selectedSeat) ? seatMap.get(selectedSeat) : undefined;
  const selectedOccupied = Boolean(selectedOccupant && selectedOccupant.id);

  return Array.from({ length: maxSeats }, (_, index) => {
    const seatIndex = index + 1;
    const occupant = seatMap.get(seatIndex);
    const occupantName = occupant ? (safeDecodeComponent(occupant.nickname).trim() || "玩家") : "";
    const label = occupant
      ? occupantName.slice(0, 6)
      : "空";

    let actionText = "";
    let hintClass = "";
    const selected = Boolean(selectedSeat && seatIndex === selectedSeat);

    if (selected) {
      actionText = "已选中";
      hintClass = "hint-selected";
    } else if (selectedSeat) {
      const occupied = Boolean(occupant && occupant.id);
      if (!selectedOccupied && occupied) {
        actionText = "移入";
        hintClass = "hint-move-in";
      } else if (selectedOccupied && !occupied) {
        actionText = "移出";
        hintClass = "hint-move-out";
      } else if (selectedOccupied && occupied) {
        actionText = "交换";
        hintClass = "hint-swap";
      } else {
        actionText = "";
        hintClass = "";
      }
    }

    return {
      seatIndex,
      occupied: Boolean(occupant),
      occupantId: occupant ? occupant.id : "",
      label,
      selected,
      actionText,
      hintClass
    };
  });
}

function parseCallInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const normalized = raw
    .replace(/[，,。.!！?？、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const compact = normalized
    .replace(/\s/g, "")
    .replace(/第/g, "")
    .replace(/局/g, "")
    .replace(/点数/g, "点")
    .replace(/颗/g, "个")
    .replace(/枚/g, "个")
    .replace(/只/g, "个");

  const parseChineseNumber = (token) => {
    const t = String(token || "").trim();
    if (!t) return NaN;
    if (/^\d+$/.test(t)) return Number(t);

    const map = {
      零: 0,
      〇: 0,
      一: 1,
      壹: 1,
      幺: 1,
      二: 2,
      贰: 2,
      两: 2,
      三: 3,
      叁: 3,
      四: 4,
      肆: 4,
      五: 5,
      伍: 5,
      六: 6,
      陆: 6,
      溜: 6,
      七: 7,
      柒: 7,
      八: 8,
      捌: 8,
      九: 9,
      玖: 9
    };

    // 支持 0-99：十/二十/二十三/十三
    let str = t.replace(/点/g, "").replace(/个/g, "");
    if (!str) return NaN;

    str = str.replace(/拾/g, "十");

    if (str === "十") return 10;
    if (str.length === 1 && map[str] != null) return map[str];

    const tenIndex = str.indexOf("十");
    if (tenIndex >= 0) {
      const left = str.slice(0, tenIndex);
      const right = str.slice(tenIndex + 1);
      const tens = left
        ? (Object.prototype.hasOwnProperty.call(map, left) ? map[left] : NaN)
        : 1;
      const ones = right
        ? (Object.prototype.hasOwnProperty.call(map, right) ? map[right] : NaN)
        : 0;
      if (!Number.isFinite(tens) || !Number.isFinite(ones)) return NaN;
      return tens * 10 + ones;
    }

    // 纯中文数字串：如 二三（很少见），按逐位拼接
    if ([...str].every((ch) => map[ch] != null)) {
      const digits = [...str].map((ch) => map[ch]);
      return Number(digits.map(String).join(""));
    }

    return NaN;
  };

  const parsePoint = (token) => {
    const t = String(token || "").trim();
    if (!t) return NaN;
    if (/^[1-6]$/.test(t)) return Number(t);
    const map = {
      一: 1,
      壹: 1,
      幺: 1,
      二: 2,
      贰: 2,
      两: 2,
      三: 3,
      叁: 3,
      四: 4,
      肆: 4,
      五: 5,
      伍: 5,
      六: 6,
      陆: 6,
      溜: 6
    };
    if (map[t] != null) return map[t];
    return NaN;
  };

  const tryBuild = (countToken, pointToken) => {
    const count = parseChineseNumber(countToken);
    const point = parsePoint(pointToken);
    if (!Number.isInteger(count) || count <= 0) return null;
    if (!Number.isInteger(point) || point < 1 || point > 6) return null;
    return { count, point };
  };

  // 1) 明确格式：X个Y / X个Y点
  const m1 = compact.match(/^([0-9一二三四五六七八九十两幺零〇壹贰叁肆伍陆柒捌玖拾溜]+)个([0-9一二三四五六两幺壹贰叁肆伍陆溜])点?$/);
  if (m1) {
    return tryBuild(m1[1], m1[2]);
  }

  // 2) 空格分隔：X Y
  const m2 = normalized.match(/^([0-9]+|[一二三四五六七八九十两幺零〇壹贰叁肆伍陆柒捌玖拾溜]+)\s+([1-6]|[一二三四五六两幺壹贰叁肆伍陆溜])$/);
  if (m2) {
    return tryBuild(m2[1], m2[2]);
  }

  // 3) 口语冗余：例如 “我叫十个四点”
  const m3 = compact.match(/([0-9一二三四五六七八九十两幺零〇壹贰叁肆伍陆柒捌玖拾溜]+)个?([0-9一二三四五六两幺壹贰叁肆伍陆溜])点?$/);
  if (m3) {
    const built = tryBuild(m3[1], m3[2]);
    if (built) return built;
  }

  // 4) 纯中文两字：三六 => 3个6
  if (/^[一二三四五六两幺壹贰叁肆伍陆溜][一二三四五六两幺壹贰叁肆伍陆溜]$/.test(compact)) {
    return tryBuild(compact[0], compact[1]);
  }

  return null;
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

function writeBase64ToFile(filePath, base64) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: base64,
      encoding: "base64",
      success: () => resolve(filePath),
      fail: reject
    });
  });
}

function accessFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().access({
      path: filePath,
      success: () => resolve(true),
      fail: reject
    });
  });
}

function writeArrayBufferToFile(filePath, buffer) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: buffer,
      success: () => resolve(filePath),
      fail: reject
    });
  });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i += 1) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function buildWavPcm16({ sampleRate = 16000, samples, sampleAt }) {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.max(1, Number(samples || 0));
  const sr = Math.max(8000, Number(sampleRate || 16000));

  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // Audio format = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < sampleCount; i += 1) {
    const raw = typeof sampleAt === "function" ? Number(sampleAt(i, sr)) : 0;
    const clamped = Math.max(-1, Math.min(1, raw));
    view.setInt16(offset, Math.floor(clamped * 32767), true);
    offset += 2;
  }

  return buffer;
}

function buildWavSfx(kind) {
  const k = String(kind || "");
  const sampleRate = 16000;

  const render = ({ durationMs, sampleAt }) => {
    const duration = Math.max(40, Number(durationMs || 0));
    const sampleCount = Math.max(1, Math.floor((sampleRate * duration) / 1000));
    return buildWavPcm16({
      sampleRate,
      samples: sampleCount,
      sampleAt
    });
  };

  const softTone = ({ frequencyHz, durationMs, volume = 0.25, detuneHz = 0, glide = 0 }) => {
    const duration = Math.max(50, Number(durationMs || 0));
    const totalT = duration / 1000;
    const freq = Math.max(90, Number(frequencyHz || 440));
    const detune = Number(detuneHz || 0);
    const amp = Math.max(0, Math.min(1, Number(volume)));

    return render({
      durationMs: duration,
      sampleAt: (i, sr) => {
        const t = i / sr;
        const progress = Math.min(1, t / totalT);
        const env = Math.pow(1 - progress, 1.8);
        const glideFreq = freq + glide * progress;
        const base = Math.sin(2 * Math.PI * glideFreq * t);
        const layer = Math.sin(2 * Math.PI * (glideFreq + detune) * t + 0.35);
        return (base * 0.72 + layer * 0.28) * env * amp;
      }
    });
  };

  const knock = ({ durationMs, bodyHz, overtoneHz, volume = 0.32, brightness = 0.16 }) => {
    const duration = Math.max(60, Number(durationMs || 0));
    const totalT = duration / 1000;
    const baseHz = Math.max(140, Number(bodyHz || 320));
    const topHz = Math.max(baseHz + 60, Number(overtoneHz || 860));
    const amp = Math.max(0, Math.min(1, Number(volume)));

    return render({
      durationMs: duration,
      sampleAt: (i, sr) => {
        const t = i / sr;
        const attack = Math.min(1, t / 0.008);
        const bodyEnv = Math.exp(-t / (totalT * 0.44));
        const topEnv = Math.exp(-t / (totalT * 0.14));
        const noiseEnv = Math.exp(-t / (totalT * 0.08));
        const body = Math.sin(2 * Math.PI * baseHz * t);
        const overtone = Math.sin(2 * Math.PI * topHz * t + 0.3);
        const noise = (Math.random() * 2 - 1) * brightness;
        return (body * 0.8 * bodyEnv + overtone * 0.18 * topEnv + noise * noiseEnv) * amp * attack;
      }
    });
  };

  const roll = ({ durationMs = 520, volume = 0.28 }) => {
    const duration = Math.max(240, Number(durationMs || 0));
    const totalT = duration / 1000;
    const amp = Math.max(0, Math.min(1, Number(volume)));
    const impacts = [];

    let cursor = 0.028;
    while (cursor < totalT - 0.03) {
      const progress = cursor / totalT;
      impacts.push({
        time: cursor,
        amp: 0.14 + (1 - progress) * 0.14 + Math.random() * 0.03,
        freq: 240 + Math.random() * 520,
        decay: 22 + Math.random() * 20
      });
      cursor += 0.016 + Math.random() * 0.014 + progress * 0.032;
    }

    let low = 0;
    let grain = 0;

    return render({
      durationMs: duration,
      sampleAt: (i, sr) => {
        const t = i / sr;
        const progress = Math.min(1, t / totalT);
        const bodyEnv = Math.pow(1 - progress, 1.5);
        const hissEnv = Math.pow(1 - progress, 2.8);
        const n = Math.random() * 2 - 1;
        low = low * 0.9 + n * 0.1;
        grain = grain * 0.56 + (n - low) * 0.44;

        let collision = 0;
        for (let index = 0; index < impacts.length; index += 1) {
          const impact = impacts[index];
          const dt = t - impact.time;
          if (dt < 0 || dt > 0.028) continue;
          const hitEnv = Math.exp(-dt * impact.decay);
          const strike = Math.sin(2 * Math.PI * impact.freq * dt);
          const chatter = Math.sin(2 * Math.PI * impact.freq * 1.9 * dt + 0.2);
          collision += (strike * 0.62 + chatter * 0.14) * impact.amp * hitEnv;
        }

        const rumble = low * 0.16 + grain * 0.045;
        return (rumble * bodyEnv + grain * 0.025 * hissEnv + collision) * amp;
      }
    });
  };

  const swell = ({ durationMs, lowHz, highHz, volume = 0.24, upward = true }) => {
    const duration = Math.max(160, Number(durationMs || 0));
    const totalT = duration / 1000;
    const from = Math.max(120, Number(lowHz || 240));
    const to = Math.max(from + 20, Number(highHz || 520));
    const amp = Math.max(0, Math.min(1, Number(volume)));

    return render({
      durationMs: duration,
      sampleAt: (i, sr) => {
        const t = i / sr;
        const progress = Math.min(1, t / totalT);
        const head = Math.min(1, progress / 0.12);
        const tail = Math.pow(1 - progress, 1.55);
        const freqA = upward ? from + (to - from) * progress : to - (to - from) * progress;
        const freqB = upward ? freqA * 1.25 : freqA * 0.76;
        const toneA = Math.sin(2 * Math.PI * freqA * t);
        const toneB = Math.sin(2 * Math.PI * freqB * t + 0.32);
        return (toneA * 0.68 + toneB * 0.32) * amp * head * tail;
      }
    });
  };

  if (k === "roll") return roll({});
  if (k === "open") return knock({ durationMs: 138, bodyHz: 390, overtoneHz: 1040, volume: 0.24, brightness: 0.08 });
  if (k === "ok") return knock({ durationMs: 88, bodyHz: 290, overtoneHz: 680, volume: 0.21, brightness: 0.055 });
  if (k === "call") return softTone({ frequencyHz: 330, durationMs: 120, volume: 0.2, detuneHz: 5, glide: 12 });
  if (k === "win") return swell({ durationMs: 210, lowHz: 420, highHz: 720, volume: 0.18, upward: true });
  if (k === "lose") return swell({ durationMs: 280, lowHz: 220, highHz: 340, volume: 0.17, upward: false });
  return softTone({ frequencyHz: 440, durationMs: 96, volume: 0.18, detuneHz: 4, glide: 0 });
}

function mimeToExt(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("wav")) return "wav";
  return "dat";
}

function formatClock(ts) {
  const d = new Date(Number(ts || 0));
  if (Number.isNaN(d.getTime())) return "--:--";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function buildWsHint(options, lastWsError = "") {
  const params = options && typeof options === "object"
    ? options
    : { wsUrl: options };
  const url = String(params.wsUrl || "").trim();
  const containerConfig = normalizeContainerConfig(params.containerConfig);
  const err = String(lastWsError || "");

  if (hasContainerService(containerConfig)) {
    const summary = buildContainerSummary(containerConfig);
    if (!canUseCloudSocketApi()) {
      return "当前微信基础库不支持云托管连接，请升级微信或开发者工具后重试";
    }
    if (err.includes("1006")) {
      return "云托管握手失败：请确认服务名、路径和环境绑定是否正确";
    }
    if (err.includes("connectContainer")) {
      return `云托管连接失败：${err}`;
    }
    if (err.includes("ROOM_NOT_FOUND")) {
      return "房间不存在：请确认双方进入的是同一个云托管服务";
    }
    return `当前通过微信云托管连接：${summary}`;
  }

  if (!url) {
    return "请先配置云托管服务名，或填写调试地址";
  }

  const matched = url.match(/^wss?:\/\/([^/:?#]+)/i);
  if (!matched) {
    return "地址格式不正确，请使用 ws:// 或 wss://";
  }
  const host = matched[1].toLowerCase();

  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    return "手机真机无法访问 127.0.0.1，请改成电脑局域网 IP（如 ws://192.168.1.23:3000/ws）";
  }

  if (err.includes("1006")) {
    return "1006 通常是握手或证书问题；请确认地址可访问，并优先使用 wss:// 公网域名";
  }

  if (err.includes("ROOM_NOT_FOUND")) {
    return "房间不存在：请确认两台手机连接的是同一个 WS 地址，且服务端没有重启";
  }

  if (/^ws:\/\//i.test(url)) {
    return "真机预览建议使用 wss:// 公网地址；局域网联调请确保手机与电脑在同一 Wi-Fi";
  }

  return "如连接失败，请确认服务端已启动，并检查地址末尾是否包含 /ws";
}

function isLoopbackWsUrl(wsUrl) {
  return /^wss?:\/\/(127\.0\.0\.1|localhost|\[?::1\]?)(:\d+)?(\/|$)/i.test(String(wsUrl || "").trim());
}

function extractWsErrorText(errorLike, fallbackText = "连接中断，请稍后重试") {
  const source = errorLike && typeof errorLike === "object" ? errorLike : {};
  const candidates = [
    source.errMsg,
    source.message,
    source.reason,
    source.code ? `code=${source.code}` : ""
  ];

  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (text) {
      return text;
    }
  }

  return fallbackText;
}

function hasConnectableTarget(wsUrl, containerConfig) {
  if (hasContainerService(containerConfig)) {
    return true;
  }

  return /^wss?:\/\/.+/i.test(String(wsUrl || "").trim());
}

function ensureRecordPermission() {
  return new Promise((resolve) => {
    wx.getSetting({
      success: (settingRes) => {
        const current = settingRes.authSetting["scope.record"];

        if (current === true) {
          resolve(true);
          return;
        }

        if (current === false) {
          wx.showModal({
            title: "需要麦克风权限",
            content: "请在设置中开启麦克风权限后使用语音功能",
            confirmText: "去设置",
            success: (modalRes) => {
              if (!modalRes.confirm) {
                resolve(false);
                return;
              }

              wx.openSetting({
                success: (openRes) => {
                  resolve(Boolean(openRes.authSetting["scope.record"]));
                },
                fail: () => resolve(false)
              });
            }
          });
          return;
        }

        wx.authorize({
          scope: "scope.record",
          success: () => resolve(true),
          fail: () => resolve(false)
        });
      },
      fail: () => resolve(false)
    });
  });
}

Page({
  data: {
    wsUrl: app.globalData.wsUrl,
    containerEnvId: app.globalData.containerConfig ? app.globalData.containerConfig.envId : "",
    containerService: app.globalData.containerConfig ? app.globalData.containerConfig.service : "",
    containerWsPath: app.globalData.containerConfig ? app.globalData.containerConfig.wsPath : DEFAULT_CONTAINER_WS_PATH,
    connectionSummaryText: buildContainerSummary(app.globalData.containerConfig || {}),
    wsHintText: "",
    connected: false,
    connecting: false,
    networkStatusText: "未连接",
    lastWsError: "",
    pendingActionText: "",
    nickname: "",
    avatarUrl: "",
    selfAvatarUrl: "",
    selfInitial: "玩",
    joinRoomId: "",
    createDirection: "cw",
    createWildcardOneEnabled: true,
    createDicePerPlayer: "5",
    createMinOpeningCount: "5",
    createTestMode: false,
    devtoolsMode: false,
    roomId: "",
    displayRoomId: "------",
    playerId: "",
    resumeToken: "",
    phase: "ready",
    round: 0,
    currentPlayerId: "",
    lastCallObj: null,
    primaryActionText: "开始",
    canPrimaryAction: false,
    roomConfig: null,
    playersRaw: [],
    playersDecorated: [],
    waitingPlayersRaw: [],
    selfIsWaiting: false,
    selfIsOwner: false,
    selfHasDice: false,
    selfHasCalled: false,
    selfRollLocked: false,
    selfRollCountThisRound: 0,
    playerCount: 0,
    selectedTargetIds: [],
    ghostSeats: [],
    privateDice: [],
    roomSelfDiceFaces: buildSelfDiceDisplayItems(),
    settlementVisible: false,
    settlementSummaryText: "",
    settlementDeclaredText: "",
    settlementActualText: "",
    settlementPointAsset: "",
    settlementRows: [],
    settlementCanContinue: false,
    settlementContinueSec: 0,
    lastCallKey: "",
    callTimeline: [],
    turnCountdownSec: 0,
    myDiceVisible: false,
    myDicePeekVisible: false,
    myDiceRolling: false,
    myDiceRevealing: false,
    myDiceJustRevealed: false,
    recording: false,
    voiceTipText: "按住语音键说话，松开发送",
    callCount: "3",
    callPoint: "6",
    callCountOptions: buildCallCountOptionItems(3, 8, 1),
    callPointOptions: ["1", "2", "3", "4", "5", "6"],
    callPointOptionItems: buildCallPointOptionItems(["1", "2", "3", "4", "5", "6"]),
    maxCallCount: 1,
    callForcedOpen: false,
    callSelectorMode: "",
    callPanelExpanded: false,
    historyVisible: false,
    historyItems: [],
    historyNextBeforeRound: null,
    historyAppendMode: false,
    voiceVisible: false,
    chatVisible: false,
    chatDraft: "",
    chatItemsRaw: [],
    chatItems: [],
    chatUnreadCount: 0,
    voiceItemsRaw: [],
    voiceItems: [],
    playingVoiceId: "",
    playingVoiceTip: "点击语音可播放",
    sfxEnabled: true,
    hapticEnabled: true,
    roomShellStyle: "",
    roomTopbarCornerStyle: "",
    roomTopbarCenterStyle: "",
    roomBottomFadeStyle: "",
    roomSelfStyle: "",
    callPhaseOverlayStyle: "",
    callPanelVisible: false,
    canOpenAction: false,
    seatingVisible: false,
    seatingSelectedSeatIndex: 0,
    seatingSelectedText: "未选择",
    seatRows: [],
    legalAccepted: false,
    showLegalModal: false
  },

  showActionSheetSafe(options) {
    const opt = options && typeof options === "object" ? options : {};
    const raw = Array.isArray(opt.itemList) ? opt.itemList : [];
    const itemList = raw.map((x) => String(x || "")).filter((x) => x.trim().length > 0);

    if (!itemList.length) {
      wx.showToast({ title: "暂无可用操作", icon: "none" });
      return;
    }

    const devtoolsMode = Boolean(this.devtoolsMode || this.data.devtoolsMode);
    if (itemList.length > 6) {
      const msg = `showActionSheet.itemList 最多 6 项，当前 ${itemList.length} 项：${itemList.join("、")}`;
      // eslint-disable-next-line no-console
      console.error(`[dice-miniapp] ${msg}`);

      if (devtoolsMode) {
        wx.showModal({
          title: "开发提示",
          content: msg,
          showCancel: false
        });
        if (typeof opt.fail === "function") {
          opt.fail({ errMsg: msg });
        }
        return;
      }
    }

    wx.showActionSheet({
      ...opt,
      itemList: itemList.slice(0, 6)
    });
  },

  onLoad(options = {}) {
	    this.manualClose = false;
	    this.skipAutoReconnectOnce = false;
	    this.reconnectTimer = null;
	    this.pendingRoomAction = null;
	    this.actionEventMap = {};
	    this.pendingLeaveActionId = "";
	    this.pendingLeaveTimer = null;
	    this.leaveFinalized = false;
	    this.socketSeq = 0;
	    this.activeSocketId = 0;
	    this.devtoolsMode = isDevtoolsPlatform();
	    this.setData({
      devtoolsMode: this.devtoolsMode,
      ...buildRoomSafeAreaStyles()
    });
    this.ensureShareMenuVisible();
    this.debugClientEvent("lifecycle:onLoad", {
      options,
      routeStack: this.getRouteStack()
    }, { ui: false });

	    const storedSfx = wx.getStorageSync(SFX_ENABLED_KEY);
	    const storedHaptic = wx.getStorageSync(HAPTIC_ENABLED_KEY);
	    const sfxEnabled = storedSfx === "" || storedSfx == null ? true : Boolean(storedSfx);
	    const hapticEnabled = storedHaptic === "" || storedHaptic == null ? true : Boolean(storedHaptic);
	    this.setData({ sfxEnabled, hapticEnabled });
	    this.voiceStartTs = 0;
	    this.voiceStopLocked = false;
    this.pendingVoiceFileId = "";
    this.voiceTempMap = {};
	    this.myDiceRevealTimer = null;
	    this.myDiceAutoPeekTimer = null;
    this.myDiceRevealStepTimer = null;
    this.roomSelfRollingTimer = null;
    this.currentSelfRollActionId = "";
    this.pendingPrivateDice = [];
    this.selfRollRevealCount = 0;
    this.selfRollAudioGatePassed = false;
	    this.turnCountdownTimer = null;
	    this.turnCountdownKey = "";
	    this.turnDeadlineTs = 0;
	    this.lastAutoRollRound = 0;
    this.hasReceivedRoomState = false;
    this.lastRoundStartSfxKey = "";
    this.latestOpenResult = null;
    this.latestRoundSummary = null;
    this.settlementCountdownTimer = null;
    this.accelListening = false;
    this.accelLast = null;
    this.accelLastTs = 0;
    this.lastShakeRollTs = 0;
    this.accelHandler = null;
    this.recorderManager = null;
    this.asrManager = null;
    this.asrText = "";
    this.asrFinalText = "";
    this.audioContext = null;
    this.sfxContext = null;

    try {
      if (typeof wx.getRecorderManager === "function") {
        this.recorderManager = wx.getRecorderManager();
      }
    } catch (error) {
      this.recorderManager = null;
    }

    try {
      if (typeof wx.createInnerAudioContext === "function") {
        this.audioContext = wx.createInnerAudioContext();
        if (this.audioContext) {
	        this.audioContext.obeyMuteSwitch = false;
        }
      }
    } catch (error) {
      this.audioContext = null;
    }

    try {
      if (typeof wx.createInnerAudioContext === "function") {
        this.sfxContext = wx.createInnerAudioContext();
        if (this.sfxContext) {
	        this.sfxContext.obeyMuteSwitch = false;
        }
      }
    } catch (error) {
      this.sfxContext = null;
    }

    this.sfxPaths = {};
    void this.ensureSfxFiles();

    // Optional: WechatSI speech-to-text plugin (if the project enables it in app.json).
    try {
      // eslint-disable-next-line no-undef
      const plugin = typeof requirePlugin === "function" ? requirePlugin("WechatSI") : null;
      if (plugin && typeof plugin.getRecordRecognitionManager === "function") {
        this.asrManager = plugin.getRecordRecognitionManager();
      }
    } catch (error) {
      this.asrManager = null;
    }

    if (this.asrManager) {
      try {
        this.asrManager.onRecognize((res) => {
          this.asrText = String(res && res.result ? res.result : "").trim();
        });
        this.asrManager.onStop((res) => {
          this.asrFinalText = String(res && res.result ? res.result : "").trim();
        });
        this.asrManager.onError(() => {
          this.asrText = "";
          this.asrFinalText = "";
        });
      } catch (error) {
        this.asrManager = null;
      }
    }

    if (this.audioContext) {
      this.audioContext.onEnded(() => {
        this.setData({
          playingVoiceId: "",
          playingVoiceTip: "点击语音可播放"
        });
      });

      this.audioContext.onError(() => {
        this.setData({
          playingVoiceId: "",
          playingVoiceTip: "语音播放失败"
        });
        wx.showToast({ title: "语音播放失败", icon: "none" });
      });
    }

    if (this.recorderManager) {
      this.recorderManager.onStart(() => {
        this.voiceStopLocked = false;
        this.setData({
          recording: true,
          voiceTipText: "录音中，松开发送"
        });
      });

      this.recorderManager.onStop(async (res) => {
        this.setData({
          recording: false,
          voiceTipText: "按住语音键说话，松开发送"
        });

        const durationMs = Number(res.duration || Math.max(0, Date.now() - this.voiceStartTs));
        if (!res.tempFilePath || durationMs < 300) {
          wx.showToast({ title: "录音太短", icon: "none" });
          return;
        }

        try {
          const base64 = await readFileBase64(res.tempFilePath);
          if (!base64 || base64.length > 2000000) {
            wx.showToast({ title: "录音过长，请缩短", icon: "none" });
            return;
          }

          const fileName = `voice_${Date.now()}.mp3`;
          this.sendEvent("voice:upload", {
            fileName,
            mimeType: "audio/mpeg",
            durationMs,
            base64
          });

          const trySubmitTranscript = (text) => {
            const transcript = String(text || "").trim();
            if (!transcript) {
              return;
            }

            this.sendEvent("voice:transcript", {
              text: transcript,
              ts: Date.now()
            }, { silentLog: true });

            const parsed = parseCallInput(transcript);
            if (!parsed) {
              wx.showToast({ title: "语音识别未匹配叫骰格式", icon: "none" });
              return;
            }

            this.setData({
              callCount: String(parsed.count),
              callPoint: String(parsed.point),
              callCountOptions: this.buildCallCountOptions(parsed.count)
            });

            const canCall = this.data.phase === "calling"
              && !this.data.selfIsWaiting
              && this.data.currentPlayerId === this.data.playerId;

            if (canCall) {
              this.setData({
                callPanelExpanded: true,
                callSelectorMode: this.data.callSelectorMode || "count",
                primaryActionText: "喊點"
              });
              wx.showToast({ title: `已识别：${parsed.count}个${parsed.point}（请确认）`, icon: "none" });
            } else {
              wx.showToast({ title: `已识别：${parsed.count}个${parsed.point}`, icon: "none" });
            }
          };

          const transcript = String(this.asrFinalText || this.asrText || "").trim();
          if (transcript) {
            trySubmitTranscript(transcript);
            return;
          }

          // Fallback when ASR plugin is unavailable: manual transcript input.
          wx.showModal({
            title: "语音叫骰",
            editable: true,
            placeholderText: "输入识别文本，例如 10个4（留空则仅发送语音）",
            success: (modalRes) => {
              if (!modalRes.confirm) {
                return;
              }
              trySubmitTranscript(modalRes.content);
            }
          });
        } catch (error) {
          wx.showToast({ title: "语音读取失败", icon: "none" });
        }
      });

      this.recorderManager.onError(() => {
        this.setData({
          recording: false,
          voiceTipText: "录音失败，请重试"
        });
        wx.showToast({ title: "录音失败", icon: "none" });
      });
    }

    const forceNew = String(options.forceNew || "") === "1";
    if (forceNew) {
      wx.removeStorageSync(SESSION_KEY);
    }

    const cachedNickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    const cachedAvatarUrl = String(wx.getStorageSync(AVATAR_URL_KEY) || "").trim();
    const optNickname = safeDecodeComponent(options.nickname).trim();
    const nickname = optNickname || cachedNickname || `玩家${Math.floor(Math.random() * 1000)}`;

    this.setData({
      nickname,
      selfInitial: String(nickname || "玩家").slice(0, 1)
    });
    wx.setStorageSync(NICKNAME_KEY, nickname);
    this.setData({
      avatarUrl: cachedAvatarUrl,
      selfAvatarUrl: cachedAvatarUrl
    });

    const shouldResumeSession = String(options.resume || "") === "1";
    const cached = shouldResumeSession ? wx.getStorageSync(SESSION_KEY) : null;
    if (cached && cached.roomId && cached.playerId && cached.resumeToken) {
      this.setData({
        roomId: cached.roomId,
        displayRoomId: formatRoomIdDisplay(cached.roomId),
        joinRoomId: cached.roomId,
        playerId: cached.playerId,
        resumeToken: cached.resumeToken
      });
    }

    const cachedWsUrl = wx.getStorageSync(WS_URL_KEY);
    if (cachedWsUrl && typeof cachedWsUrl === "string") {
      this.setData({ wsUrl: cachedWsUrl.trim() });
      app.globalData.wsUrl = cachedWsUrl.trim();
    }

    const containerConfig = resolveContainerConfig({
      envId: wx.getStorageSync(CLOUD_ENV_ID_KEY),
      service: wx.getStorageSync(CLOUD_SERVICE_KEY),
      wsPath: wx.getStorageSync(CLOUD_WS_PATH_KEY)
    });
    this.setData({
      containerEnvId: containerConfig.envId,
      containerService: containerConfig.service,
      containerWsPath: containerConfig.wsPath,
      connectionSummaryText: buildContainerSummary(containerConfig)
    });
    app.globalData.containerConfig = containerConfig;

    const legalConsent = wx.getStorageSync(LEGAL_ACCEPT_KEY);
    const legalAccepted = Boolean(legalConsent && legalConsent.accepted === true);

    this.setData({
      legalAccepted,
      showLegalModal: !legalAccepted
    });
    this.refreshWsHint("");

    const mode = String(options.mode || "");
    if (mode === "create") {
      const direction = String(options.direction || "").trim();
      const wildcardOneEnabled = String(options.wildcardOneEnabled || "1") === "1";
      const dicePerPlayer = String(options.dicePerPlayer || "5").trim();
      const minOpeningCount = String(options.minOpeningCount || "5").trim();
      const testMode = String(options.testMode || "0") === "1";

      this.setData({
        createDirection: direction,
        createWildcardOneEnabled: wildcardOneEnabled,
        createDicePerPlayer: dicePerPlayer,
        createMinOpeningCount: minOpeningCount,
        createTestMode: testMode
      });

      try {
        const config = this.buildCreateConfigOrToast();
        this.queuePendingRoomAction({ kind: "create", config });
      } catch (error) {
        // invalid config handled via toast
      }
    } else if (mode === "join") {
      const roomId = safeDecodeComponent(options.roomId).trim();
      this.setData({
        joinRoomId: roomId
      });
      if (roomId) {
        this.queuePendingRoomAction({ kind: "join", roomId });
      }
    }

    if (legalAccepted) {
      if (this.handleMissingConnectionConfig()) {
        return;
      }
      if (this.handleBlockedAutoConnect()) {
        return;
      }
      this.connectSocket();
    }
  },

  onShow() {
    this.debugClientEvent("lifecycle:onShow", {
      roomId: this.data.roomId,
      playerId: this.data.playerId,
      routeStack: this.getRouteStack()
    });
    this.ensureShareMenuVisible();
    const nickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    const avatarUrl = String(wx.getStorageSync(AVATAR_URL_KEY) || "").trim();

    const nextNickname = nickname || this.data.nickname;
    const updates = {
      ...buildRoomSafeAreaStyles()
    };
    if (nextNickname && nextNickname !== this.data.nickname) {
      updates.nickname = nextNickname;
      updates.selfInitial = String(nextNickname || "玩家").slice(0, 1);
    }
    if (avatarUrl !== this.data.avatarUrl) {
      updates.avatarUrl = avatarUrl;
      updates.selfAvatarUrl = avatarUrl;
    }
    if (Object.keys(updates).length) {
      this.setData(updates);
    }

    if (this.data.connected && this.data.roomId) {
      this.sendEvent("player:update", {
        nickname: nextNickname || "",
        avatar: avatarUrl || "",
        ...buildAccountAuthPayload()
      }, { silentLog: true });
    }

    this.startShakeListener();
  },

  onShareAppMessage() {
    return this.buildRoomShareMessage();
  },

  onHide() {
    this.debugClientEvent("lifecycle:onHide", {
      roomId: this.data.roomId,
      playerId: this.data.playerId,
      routeStack: this.getRouteStack()
    });
    this.stopShakeListener();
    this.clearTurnCountdown();
  },

  startShakeListener() {
    if (this.accelListening) {
      return;
    }

    this.accelListening = true;
    this.accelLast = null;
    this.accelLastTs = 0;

    try {
      wx.startAccelerometer({ interval: "game" });
    } catch (error) {
      // ignore
    }

    this.accelHandler = (res) => {
      const now = Date.now();
      const payload = res && typeof res === "object" ? res : {};
      const x = Number(payload.x || 0);
      const y = Number(payload.y || 0);
      const z = Number(payload.z || 0);

      if (!this.accelLast) {
        this.accelLast = { x, y, z };
        this.accelLastTs = now;
        return;
      }

      const last = this.accelLast;
      const dx = x - last.x;
      const dy = y - last.y;
      const dz = z - last.z;
      const delta = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);

      this.accelLast = { x, y, z };
      this.accelLastTs = now;

      if (delta < 1.55) {
        return;
      }

      // Rolling only: shake to re-roll before OK.
      const canShakeRoll = this.data.connected
        && !this.data.selfIsWaiting
        && this.data.phase === "rolling"
        && !this.data.selfRollLocked
        && hasSelfRollsRemaining(this.data)
        && !this.data.recording
        && !this.data.myDiceRolling
        && !this.data.myDiceRevealing;
      if (!canShakeRoll) {
        return;
      }

      if (now - Number(this.lastShakeRollTs || 0) < 900) {
        return;
      }
      this.lastShakeRollTs = now;

      this.haptic("light");
      this.rollDice();
    };

    try {
      wx.onAccelerometerChange(this.accelHandler);
    } catch (error) {
      // ignore
    }
  },

  stopShakeListener() {
    if (!this.accelListening) {
      return;
    }
    this.accelListening = false;

    if (this.accelHandler) {
      try {
        wx.offAccelerometerChange(this.accelHandler);
      } catch (error) {
        // ignore
      }
    }
    this.accelHandler = null;
    this.accelLast = null;
    this.accelLastTs = 0;

    try {
      wx.stopAccelerometer();
    } catch (error) {
      // ignore
    }
  },

  clearTurnCountdown() {
    if (this.turnCountdownTimer) {
      clearInterval(this.turnCountdownTimer);
      this.turnCountdownTimer = null;
    }
    this.turnCountdownKey = "";
    this.turnDeadlineTs = 0;
    if (this.data.turnCountdownSec !== 0) {
      this.setData({ turnCountdownSec: 0 });
    }
  },

  resetTurnCountdown(turnKey) {
    const nextKey = String(turnKey || "");
    if (!nextKey || nextKey === this.turnCountdownKey) {
      return;
    }

    this.turnCountdownKey = nextKey;
    this.turnDeadlineTs = Date.now() + 18000;

    if (this.turnCountdownTimer) {
      clearInterval(this.turnCountdownTimer);
    }

    const tick = () => {
      const remainMs = this.turnDeadlineTs - Date.now();
      const sec = Math.max(0, Math.ceil(remainMs / 1000));
      if (sec !== this.data.turnCountdownSec) {
        this.setData({ turnCountdownSec: sec });
      }
      if (sec <= 0 && this.turnCountdownTimer) {
        clearInterval(this.turnCountdownTimer);
        this.turnCountdownTimer = null;
      }
    };

    tick();
    this.turnCountdownTimer = setInterval(tick, 200);
  },

  onUnload() {
    this.debugClientEvent("lifecycle:onUnload", {
      roomId: this.data.roomId,
      playerId: this.data.playerId,
      manualClose: this.manualClose,
      routeStack: this.getRouteStack()
    }, { ui: false });
    const waitingForLeaveAck = Boolean(this.pendingLeaveActionId);
    this.clearPendingLeaveRequest();
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.clearMyDiceTimers();
    this.resetSelfRollTransientState();

    if (!this.leaveFinalized && this.data.roomId && this.data.playerId && this.data.resumeToken) {
      wx.removeStorageSync(SESSION_KEY);
    }

    if (!this.leaveFinalized && !waitingForLeaveAck) {
      this.notifyServerLeave({ reason: "page_unload" });
    }

    if (this.socketTask) {
      this.debugClientEvent("ws:close_request", {
        reason: "page_unload",
        socketId: this.activeSocketId,
        roomId: this.data.roomId,
        playerId: this.data.playerId
      }, { ui: false });
      this.socketTask.close({});
    }

    if (this.recorderManager && this.data.recording) {
      this.recorderManager.stop();
    }

    if (this.audioContext) {
      this.audioContext.destroy();
      this.audioContext = null;
    }

	    if (this.sfxContext) {
	      this.sfxContext.destroy();
	      this.sfxContext = null;
	    }

	    this.stopShakeListener();
	    this.clearTurnCountdown();
    this.clearSettlementCountdown();

	    this.actionEventMap = {};
	  },

  onNicknameChange(event) {
    const nickname = event.detail.value.trim();
    this.setData({
      nickname,
      selfInitial: String(nickname || "玩家").slice(0, 1)
    });
    wx.setStorageSync(NICKNAME_KEY, nickname);

    if (this.data.connected && this.data.roomId) {
      this.sendEvent("player:update", {
        nickname,
        avatar: this.data.avatarUrl || "",
        ...buildAccountAuthPayload()
      }, { silentLog: true });
    }
  },

  onJoinRoomIdChange(event) {
    this.setData({ joinRoomId: event.detail.value.trim() });
  },

  onSelectCreateDirection(event) {
    const dir = event.currentTarget.dataset.dir;
    if (dir !== "cw" && dir !== "ccw") {
      return;
    }
    this.setData({ createDirection: dir });
  },

  onCreateWildcardChange(event) {
    this.setData({ createWildcardOneEnabled: Boolean(event.detail.value) });
  },

  onCreateDicePerPlayerChange(event) {
    this.setData({ createDicePerPlayer: event.detail.value });
  },

  onCreateMinOpeningCountChange(event) {
    this.setData({ createMinOpeningCount: event.detail.value });
  },

  onCreateTestModeChange(event) {
    this.setData({ createTestMode: Boolean(event.detail.value) });
  },

  onCallCountChange(event) {
    if (this.data.phase !== "calling" || this.data.currentPlayerId !== this.data.playerId || this.data.selfIsWaiting || this.data.callForcedOpen) {
      return;
    }
    const max = this.getMaxCallCount();
    const next = this.clampNumber(Number(event.detail.value), 1, max);
    this.setData({
      callCount: String(next),
      callCountOptions: this.buildCallCountOptions(next, max)
    });
  },

  onCallPointChange(event) {
    if (this.data.phase !== "calling" || this.data.currentPlayerId !== this.data.playerId || this.data.selfIsWaiting || this.data.callForcedOpen) {
      return;
    }
    const next = this.clampNumber(Number(event.detail.value), 1, 6);
    this.setData({ callPoint: String(next) });
  },

  onSelectCallCountOption(event) {
    if (this.data.phase !== "calling" || this.data.currentPlayerId !== this.data.playerId || this.data.selfIsWaiting || this.data.callForcedOpen) {
      return;
    }
    const value = Number(event.currentTarget.dataset.value);
    const max = this.getMaxCallCount();
    const next = this.clampNumber(value, 1, max);
    this.setData({
      callSelectorMode: "count",
      callCount: String(next),
      callCountOptions: this.buildCallCountOptions(next, max)
    });
  },

  onSelectCallPointOption(event) {
    if (this.data.phase !== "calling" || this.data.currentPlayerId !== this.data.playerId || this.data.selfIsWaiting || this.data.callForcedOpen) {
      return;
    }
    const value = Number(event.currentTarget.dataset.value);
    const next = this.clampNumber(value, 1, 6);
    this.setData({
      callSelectorMode: "point",
      callPoint: String(next)
    });
  },

  onHudPrimaryAction() {
    if (this.data.phase === "calling" && this.data.currentPlayerId === this.data.playerId && !this.data.selfIsWaiting) {
      const last = this.data.lastCallObj;
      const max = this.getMaxCallCount();
      const forcedOpen = Boolean(last && Number(last.count) === max && Number(last.point) === 6);
      if (!forcedOpen) {
        this.openCallPanel();
        return;
      }
    }
    this.onPrimaryAction();
  },

  toggleCallSelectorMode(event) {
    if (this.data.phase !== "calling" || this.data.currentPlayerId !== this.data.playerId || this.data.selfIsWaiting) {
      return;
    }
    const mode = String(event.currentTarget.dataset.mode || "");
    if (mode !== "count" && mode !== "point") {
      return;
    }
    if (this.data.callForcedOpen && mode === "point") {
      return;
    }

    this.setData({
      callSelectorMode: mode,
      callPanelExpanded: true
    });
  },

  getContainerConfig() {
    const localConfig = normalizeContainerConfig({
      envId: this.data.containerEnvId,
      service: this.data.containerService,
      wsPath: this.data.containerWsPath
    });
    if (localConfig.service) {
      return localConfig;
    }

    const appConfig = normalizeContainerConfig(app && app.globalData ? app.globalData.containerConfig : null);
    if (appConfig.service) {
      return appConfig;
    }

    return resolveContainerConfig({
      envId: wx.getStorageSync(CLOUD_ENV_ID_KEY),
      service: wx.getStorageSync(CLOUD_SERVICE_KEY),
      wsPath: wx.getStorageSync(CLOUD_WS_PATH_KEY)
    });
  },

  refreshWsHint(errorText = this.data.lastWsError) {
    this.setData({
      wsHintText: buildWsHint({
        wsUrl: this.data.wsUrl,
        containerConfig: this.getContainerConfig()
      }, errorText),
      connectionSummaryText: buildContainerSummary(this.getContainerConfig())
    });
  },

  handleMissingConnectionConfig() {
    const containerConfig = this.getContainerConfig();
    if (hasConnectableTarget(this.data.wsUrl, containerConfig)) {
      return false;
    }

    this.setData({
      connected: false,
      connecting: false,
      networkStatusText: "待配置",
      lastWsError: ""
    });
    this.refreshWsHint("");
    return true;
  },

  handleBlockedAutoConnect() {
    if (hasContainerService(this.getContainerConfig())) {
      return false;
    }

    if (this.devtoolsMode || !isLoopbackWsUrl(this.data.wsUrl)) {
      return false;
    }

    const hasPendingEntry = Boolean(this.pendingRoomAction);
    const errorText = "手机真机不可访问 127.0.0.1";

    this.setData({
      connected: false,
      connecting: false,
      networkStatusText: "请修改地址",
      lastWsError: errorText
    });
    this.refreshWsHint(errorText);

    if (hasPendingEntry) {
      wx.showToast({ title: "请先改成局域网IP或wss地址", icon: "none" });
    }

    return true;
  },

  queuePendingRoomAction(action) {
    if (!action || !action.kind) {
      return false;
    }

    if (action.kind === "join") {
      const roomId = normalizeRoomId(action.roomId);
      if (!roomId) {
        return false;
      }
      action = { ...action, roomId };
    }

    this.pendingRoomAction = action;
    const text = action.kind === "create"
      ? "连接成功后将自动创建房间"
      : `连接成功后将自动加入房间 ${action.roomId}`;
    this.setData({ pendingActionText: text });
    return true;
  },

  clearPendingRoomAction() {
    this.pendingRoomAction = null;
    if (this.data.pendingActionText) {
      this.setData({ pendingActionText: "" });
    }
  },

  flushPendingRoomAction() {
    if (!this.pendingRoomAction || !this.data.connected) {
      return false;
    }

    const action = this.pendingRoomAction;
    this.clearPendingRoomAction();

    if (action.kind === "create") {
      this.sendEvent("room:create", {
        nickname: this.data.nickname || "玩家",
        avatar: this.data.avatarUrl || "",
        config: action.config,
        ...buildAccountAuthPayload()
      });
      return true;
    }

    if (action.kind === "join") {
      const roomId = normalizeRoomId(action.roomId);
      if (!roomId) {
        return false;
      }
      this.sendEvent("room:join", {
        roomId,
        nickname: this.data.nickname || "玩家",
        avatar: this.data.avatarUrl || "",
        ...buildAccountAuthPayload()
      });
      return true;
    }

    return false;
  },

  buildCreateConfigOrToast() {
    const direction = this.data.createDirection;
    if (direction !== "cw" && direction !== "ccw") {
      wx.showToast({ title: "请先选择出手方向", icon: "none" });
      throw new Error("create config invalid: direction required");
    }

    const dicePerPlayer = Number(this.data.createDicePerPlayer);
    if (!Number.isInteger(dicePerPlayer) || dicePerPlayer < 1 || dicePerPlayer > 10) {
      wx.showToast({ title: "每人骰子数不合法（1-10）", icon: "none" });
      throw new Error("create config invalid: dicePerPlayer");
    }

    const minOpeningCount = Number(String(this.data.createMinOpeningCount || "").trim());
    if (!Number.isInteger(minOpeningCount) || minOpeningCount < 1) {
      wx.showToast({ title: "起叫最小数量不合法（>=1）", icon: "none" });
      throw new Error("create config invalid: minOpeningCount");
    }

    return {
      direction,
      wildcardOneEnabled: Boolean(this.data.createWildcardOneEnabled),
      openMode: "single",
      dicePerPlayer,
      minOpeningCount,
      testMode: Boolean(this.data.createTestMode)
    };
  },

  connectSocket() {
    if (this.data.connected) {
      wx.showToast({ title: "已连接服务器", icon: "none" });
      return;
    }

    if (this.data.connecting) {
      wx.showToast({ title: "正在连接", icon: "none" });
      return;
    }

    const containerConfig = this.getContainerConfig();
    if (hasContainerService(containerConfig)) {
      if (!canUseCloudSocketApi()) {
        const errorText = "connectContainer 不可用";
        this.setData({
          connected: false,
          connecting: false,
          networkStatusText: "无法连接",
          lastWsError: errorText
        });
        this.refreshWsHint(errorText);
        wx.showToast({ title: "请升级微信后重试", icon: "none" });
        return;
      }

      const initResult = initMiniProgramCloud(containerConfig);
      if (!initResult.ok) {
        const errorText = initResult.reason || "云能力初始化失败";
        this.setData({
          connected: false,
          connecting: false,
          networkStatusText: "无法连接",
          lastWsError: errorText
        });
        this.refreshWsHint(errorText);
        wx.showToast({ title: "云能力初始化失败", icon: "none" });
        return;
      }

      this.setData({ connecting: true, networkStatusText: "连接中" });
      const socketId = (this.socketSeq || 0) + 1;
      this.socketSeq = socketId;
      this.activeSocketId = socketId;
      this.debugClientEvent("ws:connect_attempt", {
        socketId,
        connectionMode: "cloud",
        service: containerConfig.service,
        wsPath: containerConfig.wsPath,
        roomId: this.data.roomId,
        playerId: this.data.playerId,
        pendingAction: this.pendingRoomAction ? this.pendingRoomAction.kind : "",
        manualClose: this.manualClose
      });

      wx.cloud.connectContainer({
        service: containerConfig.service,
        path: containerConfig.wsPath
      }).then((res) => {
        const socketTask = res && res.socketTask ? res.socketTask : res;
        if (this.activeSocketId !== socketId) {
          if (socketTask && typeof socketTask.close === "function") {
            try {
              socketTask.close({});
            } catch (error) {
              // ignore stale close failure
            }
          }
          return;
        }
        if (!socketTask || typeof socketTask.onOpen !== "function") {
          throw new Error("connectContainer 未返回可用的 socketTask");
        }
        this.attachSocketTask(socketTask, socketId, {
          connectionMode: "cloud",
          service: containerConfig.service,
          wsPath: containerConfig.wsPath
        });
      }).catch((error) => {
        if (this.activeSocketId !== socketId) {
          return;
        }
        const errMsg = extractWsErrorText(error);
        this.socketTask = null;
        this.stopHeartbeat();
        this.setData({
          connected: false,
          connecting: false,
          networkStatusText: "网络异常",
          lastWsError: errMsg
        });
        this.refreshWsHint(errMsg);
        this.showConnectionFailure(errMsg);

        if (this.skipAutoReconnectOnce) {
          this.skipAutoReconnectOnce = false;
          return;
        }

        if (!this.manualClose) {
          this.scheduleReconnect();
        }
      });
      return;
    }

    if (!/^wss?:\/\/.+/i.test(this.data.wsUrl)) {
      wx.showToast({ title: "服务器地址无效", icon: "none" });
      this.refreshWsHint("地址无效");
      return;
    }

    if (!this.devtoolsMode && isLoopbackWsUrl(this.data.wsUrl)) {
      const errorText = "手机真机不可访问 127.0.0.1";
      this.setData({
        lastWsError: errorText,
        networkStatusText: "请修改地址"
      });
      this.refreshWsHint(errorText);
      wx.showToast({ title: "请改为局域网IP或wss域名", icon: "none" });
      return;
    }

    this.setData({ connecting: true, networkStatusText: "连接中" });
    const socketId = (this.socketSeq || 0) + 1;
    this.socketSeq = socketId;

    const socketTask = wx.connectSocket({
      url: this.data.wsUrl,
      header: {
        "bypass-tunnel-reminder": "true",
        "ngrok-skip-browser-warning": "1"
      }
    });
    this.activeSocketId = socketId;
    this.debugClientEvent("ws:connect_attempt", {
      socketId,
      connectionMode: "direct",
      wsUrl: this.data.wsUrl,
      roomId: this.data.roomId,
      playerId: this.data.playerId,
      pendingAction: this.pendingRoomAction ? this.pendingRoomAction.kind : "",
      manualClose: this.manualClose
    });
    this.attachSocketTask(socketTask, socketId, {
      connectionMode: "direct",
      wsUrl: this.data.wsUrl
    });
  },

  attachSocketTask(socketTask, socketId, connectionMeta = {}) {
    this.socketTask = socketTask;

    socketTask.onOpen(() => {
      if (this.socketTask !== socketTask || this.activeSocketId !== socketId) {
        this.debugClientEvent("ws:open_stale", { socketId }, { ui: false });
        return;
      }

      this.startHeartbeat();
      this.setData({
        connected: true,
        connecting: false,
        networkStatusText: "网络良好",
        lastWsError: ""
      });
      this.refreshWsHint("");
      this.debugClientEvent("ws:open", {
        socketId,
        roomId: this.data.roomId,
        playerId: this.data.playerId,
        pendingAction: this.pendingRoomAction ? this.pendingRoomAction.kind : "",
        connectionMode: connectionMeta.connectionMode || "direct"
      });

      if (this.flushPendingRoomAction()) {
        return;
      }

      if (this.data.roomId && this.data.playerId && this.data.resumeToken) {
        this.rejoinRoom();
      }
    });

    socketTask.onClose((event) => {
      if (this.socketTask !== socketTask || this.activeSocketId !== socketId) {
        this.debugClientEvent("ws:close_stale", {
          socketId,
          code: event && typeof event.code !== "undefined" ? event.code : "NA"
        }, { ui: false });
        return;
      }

      const code = event && typeof event.code !== "undefined" ? event.code : "NA";
      const reason = event && event.reason ? event.reason : "";
      this.socketTask = null;
      this.stopHeartbeat();

      this.setData({
        connected: false,
        connecting: false,
        networkStatusText: "网络断开",
        lastWsError: reason ? `close(${code}):${reason}` : `close(${code})`
      });
      this.refreshWsHint(reason ? `close(${code}):${reason}` : `close(${code})`);
      this.debugClientEvent("ws:close", {
        socketId,
        code,
        reason,
        roomId: this.data.roomId,
        playerId: this.data.playerId,
        manualClose: this.manualClose,
        skipAutoReconnectOnce: this.skipAutoReconnectOnce,
        connectionMode: connectionMeta.connectionMode || "direct"
      });

      if (this.pendingLeaveActionId) {
        this.finalizeLeaveRoom();
        return;
      }

      if (this.skipAutoReconnectOnce) {
        this.skipAutoReconnectOnce = false;
        return;
      }

      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    });

    socketTask.onError((err) => {
      if (this.socketTask !== socketTask || this.activeSocketId !== socketId) {
        this.debugClientEvent("ws:error_stale", { socketId }, { ui: false });
        return;
      }

      const errMsg = extractWsErrorText(err);
      this.socketTask = null;
      this.stopHeartbeat();
      this.setData({
        connected: false,
        connecting: false,
        networkStatusText: "网络异常",
        lastWsError: errMsg
      });
      this.refreshWsHint(errMsg);
      this.debugClientEvent("ws:error", {
        socketId,
        errMsg,
        roomId: this.data.roomId,
        playerId: this.data.playerId,
        manualClose: this.manualClose,
        skipAutoReconnectOnce: this.skipAutoReconnectOnce,
        connectionMode: connectionMeta.connectionMode || "direct"
      });
      this.showConnectionFailure(errMsg);

      if (this.pendingLeaveActionId) {
        this.finalizeLeaveRoom();
        return;
      }

      if (this.skipAutoReconnectOnce) {
        this.skipAutoReconnectOnce = false;
        return;
      }

      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    });

    socketTask.onMessage((event) => {
      this.handleServerPacket(event.data);
    });
  },

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 25000);
  },

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  },

  sendHeartbeat() {
    if (!this.socketTask || !this.data.connected) {
      return;
    }

    try {
      this.socketTask.send({
        data: JSON.stringify({
          event: "system:heartbeat",
          payload: {
            ts: Date.now()
          }
        })
      });
    } catch (error) {
      // ignore heartbeat send failure
    }
  },

  showConnectionFailure(errMsg) {
    void errMsg;
  },

  scheduleReconnect() {
    if (this.reconnectTimer || this.manualClose) {
      return;
    }

    this.debugClientEvent("ws:reconnect_scheduled", {
      roomId: this.data.roomId,
      playerId: this.data.playerId,
      delayMs: 2000
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.debugClientEvent("ws:reconnect_fire", {
        roomId: this.data.roomId,
        playerId: this.data.playerId
      });
      this.connectSocket();
    }, 2000);
  },

  createRoom() {
    let config;
    try {
      config = this.buildCreateConfigOrToast();
    } catch (error) {
      return;
    }

    if (!this.data.connected) {
      this.queuePendingRoomAction({ kind: "create", config });
      this.debugClientEvent("room:create_queued", {
        roomId: this.data.roomId,
        playerId: this.data.playerId
      });
      this.connectSocket();
      wx.showToast({ title: "连接中，成功后自动创建", icon: "none" });
      return;
    }

    this.clearPendingRoomAction();
    this.debugClientEvent("room:create_send", {
      roomId: this.data.roomId,
      playerId: this.data.playerId
    });
    this.sendEvent("room:create", {
      nickname: this.data.nickname || "玩家",
      avatar: this.data.avatarUrl || "",
      config,
      ...buildAccountAuthPayload()
    });
  },

  joinRoom() {
    const rawRoomId = String(this.data.joinRoomId || "").trim();
    const roomId = normalizeRoomId(rawRoomId);

    if (!rawRoomId) {
      wx.showToast({ title: "请输入房间号", icon: "none" });
      return;
    }

    if (!roomId) {
      wx.showToast({ title: "房间不存在或房间号有误", icon: "none", duration: 5000 });
      return;
    }

    if (!/^\d{6}$/.test(roomId)) {
      wx.showToast({ title: "房间不存在或房间号有误", icon: "none", duration: 5000 });
      return;
    }

    if (!this.data.connected) {
      this.queuePendingRoomAction({
        kind: "join",
        roomId
      });
      this.debugClientEvent("room:join_queued", {
        roomId,
        playerId: this.data.playerId
      });
      this.connectSocket();
      wx.showToast({ title: "连接中，成功后自动加入", icon: "none" });
      return;
    }

    this.clearPendingRoomAction();
    this.debugClientEvent("room:join_send", {
      roomId,
      playerId: this.data.playerId
    });
    this.sendEvent("room:join", {
      roomId,
      nickname: this.data.nickname || "玩家",
      avatar: this.data.avatarUrl || "",
      ...buildAccountAuthPayload()
    });
  },

  rejoinRoom() {
    this.debugClientEvent("room:rejoin_send", {
      roomId: this.data.roomId,
      playerId: this.data.playerId
    });
    this.sendEvent("room:rejoin", {
      roomId: this.data.roomId,
      playerId: this.data.playerId,
      resumeToken: this.data.resumeToken
    }, { silentLog: true });
  },

  leaveRoom() {
    if (this.leaveFinalized || this.pendingLeaveActionId) {
      return;
    }

    if (!this.socketTask || !this.data.connected) {
      this.finalizeLeaveRoom();
      return;
    }

    const actionId = this.notifyServerLeave({
      reason: "menu_leave",
      finalizeOnSendFail: true
    });

    if (!actionId) {
      this.finalizeLeaveRoom();
      return;
    }

    this.pendingLeaveActionId = actionId;
    this.setData({ networkStatusText: "退出中" });
    this.pendingLeaveTimer = setTimeout(() => {
      if (this.pendingLeaveActionId === actionId && !this.leaveFinalized) {
        this.debugClientEvent("room:leave_timeout", {
          roomId: this.data.roomId,
          playerId: this.data.playerId,
          actionId
        });
        this.finalizeLeaveRoom();
      }
    }, 1200);
  },

  startGame() {
    this.haptic("light");
    this.playPrimaryAwareSfx("call");
    this.sendEvent("game:start", {});
  },

  rollDice() {
    if (
      this.data.phase !== "rolling"
      || this.data.selfIsWaiting
      || this.data.selfRollLocked
      || !hasSelfRollsRemaining(this.data)
      || this.data.recording
      || this.data.myDiceRolling
      || this.data.myDiceRevealing
    ) {
      return;
    }

    this.haptic("light");
    this.playPrimaryAwareSfx("roll");
    this.setData({
      selfRollCountThisRound: Math.min(
        MAX_ROLLS_PER_ROUND,
        (Number(this.data.selfRollCountThisRound) || 0) + 1
      )
    });
    this.showMyDiceDrawerRolling();
    this.sendEvent("dice:roll", {});
  },

  lockDice() {
    this.haptic("light");
    this.playPrimaryAwareSfx("ok");
    this.sendEvent("dice:lock", {});
  },

  finishRolling() {
    this.haptic("light");
    this.playPrimaryAwareSfx("call");
    this.sendEvent("rolling:finish", {});
  },

  clearRoomSelfRollingTimer() {
    if (this.roomSelfRollingTimer) {
      clearInterval(this.roomSelfRollingTimer);
      this.roomSelfRollingTimer = null;
    }
  },

  clearMyDiceRevealStepTimer() {
    if (this.myDiceRevealStepTimer) {
      clearTimeout(this.myDiceRevealStepTimer);
      this.myDiceRevealStepTimer = null;
    }
  },

  clearMyDiceTimers() {
    if (this.myDiceRevealTimer) {
      clearTimeout(this.myDiceRevealTimer);
      this.myDiceRevealTimer = null;
    }
    if (this.myDiceAutoPeekTimer) {
      clearTimeout(this.myDiceAutoPeekTimer);
      this.myDiceAutoPeekTimer = null;
    }
    this.clearMyDiceRevealStepTimer();
    this.clearRoomSelfRollingTimer();
  },

  resetSelfRollTransientState() {
    this.currentSelfRollActionId = "";
    this.pendingPrivateDice = [];
    this.selfRollRevealCount = 0;
    this.selfRollAudioGatePassed = false;
  },

  getSelfRollAudioDurationMs() {
    return ROOM_SELF_ROLLING_DURATION_MS;
  },

  getSelfRollRevealStaggerMs() {
    return ROOM_SELF_REVEAL_STAGGER_MS;
  },

  getSelfRollSettleDurationMs() {
    return ROOM_SELF_REVEAL_SETTLE_MS;
  },

  updateSelfRollDisplay(expected) {
    this.setData({
      roomSelfDiceFaces: buildSelfRollDisplayItems({
        count: expected,
        finalDice: this.pendingPrivateDice,
        revealCount: this.selfRollRevealCount
      })
    });
  },

  maybeStartSelfRollReveal(expected, actionId = this.currentSelfRollActionId) {
    if (!actionId || actionId !== this.currentSelfRollActionId) {
      return;
    }
    if (!this.selfRollAudioGatePassed) {
      return;
    }
    if (!Array.isArray(this.pendingPrivateDice) || this.pendingPrivateDice.length !== expected) {
      return;
    }
    if (this.data.myDiceRevealing) {
      return;
    }

    this.setData({
      myDiceRolling: false,
      myDiceRevealing: true,
      myDiceJustRevealed: false
    });

    const revealNext = () => {
      if (actionId !== this.currentSelfRollActionId) {
        return;
      }

      this.selfRollRevealCount = Math.min(expected, this.selfRollRevealCount + 1);
      this.updateSelfRollDisplay(expected);

      if (this.selfRollRevealCount >= expected) {
        this.clearMyDiceRevealStepTimer();
        this.clearRoomSelfRollingTimer();
        this.setData({
          myDiceRevealing: false,
          myDiceJustRevealed: true,
          roomSelfDiceFaces: buildDiceFaceItems(this.pendingPrivateDice)
        });
        this.myDiceRevealTimer = setTimeout(() => {
          if (actionId !== this.currentSelfRollActionId) {
            return;
          }
          this.setData({ myDiceJustRevealed: false });
          this.myDiceRevealTimer = null;
        }, this.getSelfRollSettleDurationMs());
        return;
      }

      this.myDiceRevealStepTimer = setTimeout(revealNext, this.getSelfRollRevealStaggerMs());
    };

    revealNext();
  },

  startRoomSelfRolling(expected, actionId = this.currentSelfRollActionId) {
    const size = Math.max(1, Number(expected) || 5);
    const applyRollingFrame = () => {
      if (!actionId || actionId !== this.currentSelfRollActionId) {
        return;
      }
      this.updateSelfRollDisplay(size);
    };

    this.clearRoomSelfRollingTimer();
    applyRollingFrame();
    this.roomSelfRollingTimer = setInterval(applyRollingFrame, ROOM_SELF_ROLLING_FRAME_MS);
  },

  showMyDiceDrawerRolling() {
    const expected = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
      ? this.data.roomConfig.dicePerPlayer
      : 5;
    const actionId = buildActionId();

    this.clearMyDiceTimers();
    this.currentSelfRollActionId = actionId;
    this.pendingPrivateDice = [];
    this.selfRollRevealCount = 0;
    this.selfRollAudioGatePassed = false;

    this.setData({
      privateDice: [],
      selfHasDice: false,
      myDiceVisible: true,
      myDicePeekVisible: false,
      myDiceRolling: true,
      myDiceRevealing: false,
      myDiceJustRevealed: false,
      roomSelfDiceFaces: buildSelfRollDisplayItems({ count: expected })
    });
    this.startRoomSelfRolling(expected, actionId);

    this.myDiceAutoPeekTimer = setTimeout(() => {
      if (actionId !== this.currentSelfRollActionId) {
        return;
      }
      this.selfRollAudioGatePassed = true;
      this.myDiceAutoPeekTimer = null;
      this.maybeStartSelfRollReveal(expected, actionId);
    }, this.getSelfRollAudioDurationMs());
  },

  openMyDiceDrawer() {
    if (this.data.selfIsWaiting) {
      return;
    }

    const expected = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
      ? this.data.roomConfig.dicePerPlayer
      : 5;

    const privateDice = Array.isArray(this.data.privateDice) ? this.data.privateDice : [];
    const fallback = buildSelfDiceFallback(expected);
    const display = privateDice.length === expected ? privateDice : fallback;

    this.setData({
      myDiceVisible: true,
      myDicePeekVisible: false,
      myDiceRolling: false,
      myDiceRevealing: false,
      myDiceJustRevealed: false,
      roomSelfDiceFaces: buildDiceFaceItems(display)
    });
  },

  closeMyDiceDrawer() {
    const expected = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
      ? this.data.roomConfig.dicePerPlayer
      : 5;

    const hasDice = Array.isArray(this.data.privateDice) && this.data.privateDice.length === expected;
    const canPeek = hasDice && !this.data.selfIsWaiting && this.data.phase !== "ended";
    this.setData({
      myDiceVisible: false,
      myDicePeekVisible: canPeek,
      myDiceRolling: false,
      myDiceRevealing: false,
      myDiceJustRevealed: false
    });
  },

  clearSettlementCountdown() {
    if (!this.settlementCountdownTimer) {
      return;
    }
    clearInterval(this.settlementCountdownTimer);
    this.settlementCountdownTimer = null;
  },

  startSettlementCountdown(seconds = 2) {
    this.clearSettlementCountdown();
    let remain = Number(seconds);
    if (!Number.isInteger(remain) || remain < 0) {
      remain = 2;
    }

    this.setData({ settlementContinueSec: remain });
    if (remain <= 0) {
      return;
    }

    this.settlementCountdownTimer = setInterval(() => {
      remain -= 1;
      if (remain <= 0) {
        this.clearSettlementCountdown();
        this.setData({ settlementContinueSec: 0 });
        return;
      }
      this.setData({ settlementContinueSec: remain });
    }, 1000);
  },

  showSettlementPanel(openResult, roundSummary) {
    if (openResult && typeof openResult === "object") {
      this.latestOpenResult = openResult;
    }
    if (roundSummary && typeof roundSummary === "object") {
      this.latestRoundSummary = roundSummary;
    }

    const sourceOpenResult = this.latestOpenResult;
    if (!sourceOpenResult) {
      return;
    }

    const openRound = Number(sourceOpenResult.round || 0);
    const summaryRound = Number(this.latestRoundSummary && this.latestRoundSummary.round);
    const matchedSummary = summaryRound === openRound ? this.latestRoundSummary : null;

    const model = buildSettlementViewModel({
      openResult: sourceOpenResult,
      roundSummary: matchedSummary,
      playersRaw: this.data.playersRaw,
      selfPlayerId: this.data.playerId
    });
    if (!model) {
      return;
    }

    const selfId = String(this.data.playerId || "");
    const settlementCanContinue = Boolean(model.loserId) && selfId === String(model.loserId);
    const shouldPlaySettlementSfx = !this.data.settlementVisible;
    if (settlementCanContinue) {
      this.startSettlementCountdown(2);
    } else {
      this.clearSettlementCountdown();
    }
    if (shouldPlaySettlementSfx) {
      this.playSfx("settlement");
    }
    this.setData({
      settlementVisible: true,
      settlementSummaryText: model.summaryText,
      settlementDeclaredText: model.declaredText,
      settlementActualText: model.actualText,
      settlementPointAsset: model.pointAsset,
      settlementRows: model.rows,
      settlementCanContinue,
      settlementContinueSec: settlementCanContinue ? this.data.settlementContinueSec : 0
    });
  },

  hideSettlementPanel() {
    this.clearSettlementCountdown();
    this.latestOpenResult = null;
    this.latestRoundSummary = null;
    this.setData({
      settlementVisible: false,
      settlementSummaryText: "",
      settlementDeclaredText: "",
      settlementActualText: "",
      settlementPointAsset: "",
      settlementRows: [],
      settlementCanContinue: false,
      settlementContinueSec: 0
    });
  },

  restartRound() {
    this.haptic("light");
    this.playPrimaryAwareSfx("");
    this.clearMyDiceTimers();
    this.resetSelfRollTransientState();
    const expected = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
      ? this.data.roomConfig.dicePerPlayer
      : 5;

    this.setData({
      settlementVisible: false,
      settlementSummaryText: "",
      settlementDeclaredText: "",
      settlementActualText: "",
      settlementPointAsset: "",
      settlementRows: [],
      settlementCanContinue: false,
      settlementContinueSec: 0,
      privateDice: [],
      roomSelfDiceFaces: buildSelfDiceDisplayItems(),
      selfHasDice: false,
      selfHasCalled: false,
      selfRollCountThisRound: 0,
      myDiceVisible: false,
      myDicePeekVisible: false,
      myDiceRolling: false,
      myDiceRevealing: false,
      myDiceJustRevealed: false,
      callTimeline: [],
      lastCallKey: ""
    });
    this.clearSettlementCountdown();
    this.latestOpenResult = null;
    this.latestRoundSummary = null;
    this.sendEvent("round:restart", {});
  },

  onPrimaryAction() {
    if (!this.data.canPrimaryAction) {
      return;
    }

    const phase = this.data.phase;
    if (phase === "ready") {
      this.startGame();
      return;
    }

    if (phase === "rolling") {
      if (!this.data.selfHasDice) {
        this.rollDice();
        return;
      }

      if (!this.data.selfRollLocked) {
        this.lockDice();
        return;
      }

      return;
    }

    if (phase === "calling") {
      if (this.data.currentPlayerId === this.data.playerId) {
        if (this.data.callForcedOpen) {
          this.openDice();
        } else {
          this.makeCallWithInput();
        }
        return;
      }
    }

    if (phase === "ended") {
      this.restartRound();
      return;
    }
  },

  makeCallWithInput() {
    if (this.data.callForcedOpen) {
      wx.showToast({ title: "已到上限，请直接开牌", icon: "none" });
      return;
    }
    this.haptic("light");
    const count = Number(this.data.callCount);
    const point = Number(this.data.callPoint);

    if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(point) || point < 1 || point > 6) {
      wx.showToast({ title: "叫牌格式错误", icon: "none" });
      return;
    }

    this.playSfx("primary");
    this.sendEvent("call:make", {
      count,
      point
    });

    this.setData({
      callSelectorMode: "",
      callPanelExpanded: false,
      primaryActionText: "叫牌"
    });

    if (this.data.callPanelVisible) {
      this.setData({ callPanelVisible: false });
    }
  },

  quickCall() {
    wx.showModal({
      title: "叫牌",
      editable: true,
      placeholderText: "输入例如 3个6 或 3 6",
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        const parsed = parseCallInput(res.content);
        if (!parsed) {
          wx.showToast({ title: "格式错误", icon: "none" });
          return;
        }

        this.setData({
          callCount: String(parsed.count),
          callPoint: String(parsed.point),
          callCountOptions: this.buildCallCountOptions(parsed.count)
        });
      }
    });
  },

  async onVoiceTouchStart() {
    if (this.data.recording || this.voiceStopLocked) {
      return;
    }

    if (!this.recorderManager || typeof this.recorderManager.start !== "function") {
      wx.showToast({ title: "当前设备暂不支持录音", icon: "none" });
      return;
    }

    const canUseVoice = this.data.phase === "calling"
      && !this.data.selfIsWaiting
      && this.data.currentPlayerId === this.data.playerId;
    if (!canUseVoice) {
      wx.showToast({ title: "仅轮到你叫牌时可语音", icon: "none" });
      return;
    }

    if (!this.data.legalAccepted) {
      wx.showToast({ title: "请先同意隐私协议", icon: "none" });
      this.setData({ showLegalModal: true });
      return;
    }

    if (!this.data.connected) {
      wx.showToast({ title: "网络未连接", icon: "none" });
      return;
    }

    const granted = await ensureRecordPermission();
    if (!granted) {
      wx.showToast({ title: "未获得麦克风权限", icon: "none" });
      return;
    }

    this.voiceStartTs = Date.now();
    this.voiceStopLocked = false;
    this.asrText = "";
    this.asrFinalText = "";

    if (this.asrManager) {
      try {
        this.asrManager.start({
          duration: 10000,
          lang: "zh_CN"
        });
      } catch (error) {
        // ignore ASR start failure
      }
    }

    try {
      this.recorderManager.start({
        duration: 10000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: "mp3"
      });
    } catch (error) {
      wx.showToast({ title: "录音启动失败", icon: "none" });
    }
  },

  onVoiceTouchEnd() {
    if (!this.data.recording || this.voiceStopLocked) {
      return;
    }

    this.voiceStopLocked = true;
    if (this.asrManager) {
      try {
        this.asrManager.stop();
      } catch (error) {
        // ignore ASR stop failure
      }
    }
    if (this.recorderManager && typeof this.recorderManager.stop === "function") {
      this.recorderManager.stop();
    }
  },

  onVoiceTouchCancel() {
    this.onVoiceTouchEnd();
  },

  onTapSeat(event) {
    if (this.data.selfIsWaiting) {
      return;
    }

    const playerId = event.currentTarget.dataset.id;
    if (!playerId || playerId === this.data.playerId) {
      return;
    }

    const self = (this.data.playersRaw || []).find((player) => player.id === this.data.playerId);
    if (this.data.phase === "ready" && self && self.isOwner && this.data.round === 0) {
      const picked = (this.data.playersRaw || []).find((p) => p.id === playerId);
      this.openSeatingPanel(picked);
      return;
    }

    const current = new Set(this.data.selectedTargetIds || []);
    if (current.has(playerId)) {
      current.delete(playerId);
    } else {
      current.add(playerId);
    }

    this.updateSelectedTargets([...current]);
  },

  openSeatingPanel(presetPlayer) {
    if (!(this.data.phase === "ready" && this.data.selfIsOwner && this.data.round === 0)) {
      wx.showToast({ title: "当前不可排位", icon: "none" });
      return;
    }

    const picked = presetPlayer && presetPlayer.id ? presetPlayer : null;
    const pickedSeatIndex = picked && Number.isInteger(picked.seatIndex) ? picked.seatIndex : 0;
    const pickedName = picked ? (safeDecodeComponent(picked.nickname).trim() || "玩家").slice(0, 6) : "";
    const pickedText = pickedSeatIndex
      ? `${pickedSeatIndex}号 ${pickedName || "玩家"}`
      : "未选择";
    this.setData({
      seatingVisible: true,
      seatingSelectedSeatIndex: pickedSeatIndex,
      seatingSelectedText: pickedText,
      seatRows: buildSeatRows(this.data.playersRaw, 8, pickedSeatIndex)
    });
  },

  closeSeatingPanel() {
    this.setData({
      seatingVisible: false
    });
  },

  onSeatingSelectDirection(event) {
    if (!(this.data.phase === "ready" && this.data.selfIsOwner && this.data.round === 0)) {
      wx.showToast({ title: "当前不可修改方向", icon: "none" });
      return;
    }
    const dir = event.currentTarget.dataset.dir;
    if (dir !== "cw" && dir !== "ccw") return;
    const current = this.data.roomConfig && this.data.roomConfig.direction;
    if (current === dir) return;
    this.haptic("light");
    this.playSfx("ok");
    this.sendEvent("room:config:update", { direction: dir });
  },

  clearSeatingSelection() {
    if (!this.data.seatingSelectedSeatIndex) {
      return;
    }
    this.setData({ seatingSelectedSeatIndex: 0, seatingSelectedText: "未选择", seatRows: buildSeatRows(this.data.playersRaw, 8, 0) });
  },

  onTapSeatRow(event) {
    const seatIndex = Number(event.currentTarget.dataset.seat);
    if (!Number.isInteger(seatIndex) || seatIndex < 1 || seatIndex > 8) {
      return;
    }

    const selectedSeatIndex = Number(this.data.seatingSelectedSeatIndex || 0);
    const rows = this.data.seatRows || [];

    if (!selectedSeatIndex) {
      const row = rows.find((r) => r.seatIndex === seatIndex);
      const text = row && row.occupied ? `${seatIndex}号 ${String(row.label || "").split("（")[0]}` : `${seatIndex}号 空`;
      this.setData({
        seatingSelectedSeatIndex: seatIndex,
        seatingSelectedText: text,
        seatRows: buildSeatRows(this.data.playersRaw, 8, seatIndex)
      });
      return;
    }

    if (seatIndex === selectedSeatIndex) {
      this.clearSeatingSelection();
      return;
    }

    const fromRow = rows.find((r) => r.seatIndex === selectedSeatIndex);
    const toRow = rows.find((r) => r.seatIndex === seatIndex);
    const fromId = fromRow ? String(fromRow.occupantId || "") : "";
    const toId = toRow ? String(toRow.occupantId || "") : "";

    // both empty => just switch selection
    if (!fromId && !toId) {
      const text = `${seatIndex}号 空`;
      this.setData({
        seatingSelectedSeatIndex: seatIndex,
        seatingSelectedText: text,
        seatRows: buildSeatRows(this.data.playersRaw, 8, seatIndex)
      });
      return;
    }

    this.haptic("light");
    this.playSfx("ok");

    // move
    if (fromId && !toId) {
      this.sendEvent("room:seat:set", { playerId: fromId, seatIndex });
      this.clearSeatingSelection();
      return;
    }
    if (!fromId && toId) {
      this.sendEvent("room:seat:set", { playerId: toId, seatIndex: selectedSeatIndex });
      this.clearSeatingSelection();
      return;
    }

    // swap
    if (fromId && toId) {
      this.sendEvent("room:seat:swap", { playerIdA: fromId, playerIdB: toId });
      this.clearSeatingSelection();
    }
  },

  onTapWaitingChip() {
    const waiting = this.data.waitingPlayersRaw || [];
    if (!waiting.length) return;

    if (this.data.selfIsOwner) {
      this.openWaitingAdmitFlow();
      return;
    }

    const labels = waiting.map((p) => String(p.nickname || "等待").slice(0, 6));
    this.showActionSheetSafe({
      itemList: labels,
      success: () => {},
      fail: () => {}
    });
  },

  openDice() {
    const isCallingTurn = this.data.phase === "calling"
      && this.data.currentPlayerId === this.data.playerId
      && !this.data.selfIsWaiting;
    if (isCallingTurn && !this.data.canOpenAction) {
      wx.showToast({ title: "当前还不能开牌", icon: "none" });
      return;
    }

    this.haptic("light");
    this.playPrimaryAwareSfx("open");
    this.setData({
      callSelectorMode: "",
      callPanelExpanded: false
    });
    this.sendEvent("open:request", {});
  },

  toggleHistory() {
    if (this.data.selfIsWaiting) {
      wx.showToast({ title: "旁观者不可操作", icon: "none" });
      return;
    }
    const nextVisible = !this.data.historyVisible;
    this.setData({
      historyVisible: nextVisible,
      voiceVisible: false,
      chatVisible: false
    });

    if (nextVisible && this.data.historyItems.length === 0) {
      this.loadHistory();
    }
  },

  loadHistory() {
    this.setData({ historyAppendMode: false });
    this.sendEvent("history:list", { limit: 10 });
  },

  loadMoreHistory() {
    if (!this.data.historyNextBeforeRound) {
      return;
    }

    this.setData({ historyAppendMode: true });
    this.sendEvent("history:list", {
      limit: 10,
      beforeRound: this.data.historyNextBeforeRound
    });
  },

  onSettlementViewHistory() {
    this.setData({
      historyVisible: true,
      voiceVisible: false,
      chatVisible: false
    });
    if (!this.data.historyItems.length) {
      this.loadHistory();
    }
  },

  onSettlementContinue() {
    if (!this.data.canPrimaryAction) {
      wx.showToast({ title: this.data.primaryActionText || "当前不可继续", icon: "none" });
      return;
    }
    this.onPrimaryAction();
  },

  toggleVoiceList() {
    if (this.data.selfIsWaiting) {
      wx.showToast({ title: "旁观者不可操作", icon: "none" });
      return;
    }
    const nextVisible = !this.data.voiceVisible;
    this.setData({
      voiceVisible: nextVisible,
      historyVisible: false,
      chatVisible: false
    });

    if (nextVisible && this.data.voiceItems.length === 0) {
      this.loadVoiceList();
    }
  },

  toggleChatList() {
    if (this.data.selfIsWaiting) {
      wx.showToast({ title: "旁观者不可操作", icon: "none" });
      return;
    }
    const nextVisible = !this.data.chatVisible;
    this.setData({
      chatVisible: nextVisible,
      chatUnreadCount: nextVisible ? 0 : this.data.chatUnreadCount,
      historyVisible: false,
      voiceVisible: false
    });

    if (nextVisible && this.data.chatItems.length === 0) {
      this.loadChatList();
    }
  },

  loadChatList() {
    if (this.data.selfIsWaiting) {
      return;
    }
    this.sendEvent("chat:list", { limit: 30 }, { silentLog: true });
  },

  onChatDraftChange(event) {
    this.setData({ chatDraft: String(event.detail.value || "") });
  },

  sendChat() {
    if (this.data.selfIsWaiting) {
      wx.showToast({ title: "旁观者不可操作", icon: "none" });
      return;
    }
    const text = String(this.data.chatDraft || "").trim();
    if (!text) {
      wx.showToast({ title: "请输入内容", icon: "none" });
      return;
    }
    this.haptic("light");
    this.sendEvent("chat:send", { text });
    this.setData({ chatDraft: "" });
  },

  loadVoiceList() {
    if (this.data.selfIsWaiting) {
      return;
    }
    this.sendEvent("voice:list", {
      limit: 20
    });
  },

  async onTapVoiceItem(event) {
    if (this.data.selfIsWaiting) {
      wx.showToast({ title: "旁观者不可操作", icon: "none" });
      return;
    }
    const fileId = event.currentTarget.dataset.id;
    if (!fileId) {
      return;
    }

    if (!this.audioContext) {
      wx.showToast({ title: "播放器未初始化", icon: "none" });
      return;
    }

    if (this.data.playingVoiceId === fileId) {
      this.audioContext.stop();
      this.setData({
        playingVoiceId: "",
        playingVoiceTip: "点击语音可播放"
      });
      return;
    }

    const cached = this.voiceTempMap[fileId];
    if (cached) {
      this.playVoiceFile(fileId, cached);
      return;
    }

    this.pendingVoiceFileId = fileId;
    this.setData({
      playingVoiceTip: "语音加载中..."
    });

    this.sendEvent("voice:fetch", { fileId }, { silentLog: true });
  },

  playVoiceFile(fileId, path) {
    if (!this.audioContext) {
      return;
    }

    this.audioContext.stop();
    this.audioContext.src = path;
    this.audioContext.play();

    this.setData({
      playingVoiceId: fileId,
      playingVoiceTip: "正在播放语音"
    });
  },

  onTapMore() {
    const isOwnerReady = Boolean(this.data.selfIsOwner && this.data.phase === "ready" && this.data.round === 0);
    const itemList = [
      isOwnerReady ? "排位设置" : "",
      "设置",
      "离开房间"
    ].filter(Boolean);
    this.showActionSheetSafe({
      itemList,
      success: (res) => {
        const idx = res.tapIndex;

        if (isOwnerReady) {
          if (idx === 0) {
            this.openSeatingPanel();
            return;
          }
          if (idx === 1) {
            this.openToolsMenu();
            return;
          }
          if (idx === 2) {
            this.leaveRoom();
            return;
          }
        } else {
          if (idx === 0) {
            this.openToolsMenu();
            return;
          }
          if (idx === 1) {
            this.leaveRoom();
            return;
          }
        }
      },
      fail: (err) => {
        const msg = String(err && err.errMsg ? err.errMsg : "");
        if (msg.includes("cancel")) {
          return;
        }
        wx.showToast({ title: "菜单打开失败", icon: "none" });
      }
    });
  },

  ensureShareMenuVisible() {
    if (!wx.showShareMenu || typeof wx.showShareMenu !== "function") {
      return;
    }

    try {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ["shareAppMessage"]
      });
    } catch (error) {
      try {
        wx.showShareMenu({
          withShareTicket: true
        });
      } catch (fallbackError) {
        // ignore
      }
    }
  },

  copyRoomId() {
    const roomId = String(this.data.roomId || "").trim();
    if (!roomId) {
      wx.showToast({ title: "房间号暂无", icon: "none" });
      return;
    }

    wx.setClipboardData({
      data: roomId,
      success: () => {
        wx.showToast({ title: "房间号已复制", icon: "none" });
      },
      fail: () => {
        wx.showToast({ title: `房间号：${roomId}`, icon: "none" });
      }
    });
  },

  buildRoomShareMessage() {
    const roomId = String(this.data.roomId || "").trim();
    const nickname = safeDecodeComponent(this.data.nickname).trim() || "好友";

    if (!roomId) {
      return {
        title: "在线摇骰子，来一局",
        path: "/pages/lobby/lobby"
      };
    }

    return {
      title: `${nickname} 邀你加入房间 ${roomId}`,
      path: buildRoomShareEntryUrl(roomId)
    };
  },

  onTapShareRoom() {
    if (!String(this.data.roomId || "").trim()) {
      wx.showToast({ title: "房间创建后才可分享", icon: "none" });
    }
  },

  openToolsMenu() {
    const sections = [];

    sections.push({
      label: "音效与反馈",
      open: () => this.openToolsBasicMenu()
    });

    const canOwnerTools = this.data.selfIsOwner && (this.data.phase === "ready" || this.data.phase === "ended");
    if (canOwnerTools) {
      sections.push({
        label: "房主工具",
        open: () => this.openToolsOwnerMenu()
      });
    }

    const config = this.data.roomConfig;
    const testMode = Boolean(config && config.testMode);
    if (this.data.selfIsOwner && testMode) {
      sections.push({
        label: "测试工具",
        open: () => this.openToolsTestMenu()
      });
    }

    if (this.devtoolsMode) {
      sections.push({
        label: "开发工具",
        open: () => this.openToolsDevMenu()
      });
    }

    if (sections.length === 1) {
      sections[0].open();
      return;
    }

    const itemList = sections.map((s) => s.label).slice(0, 6);
    this.showActionSheetSafe({
      itemList,
      success: (res) => {
        const picked = sections[res.tapIndex];
        if (picked && typeof picked.open === "function") {
          picked.open();
        }
      },
      fail: (err) => {
        const msg = String(err && err.errMsg ? err.errMsg : "");
        if (msg.includes("cancel")) {
          return;
        }
        wx.showToast({ title: "菜单打开失败", icon: "none" });
      }
    });
  },

  openToolsBasicMenu() {
    const items = [];
    const actions = [];

    const sfxToggleLabel = this.data.sfxEnabled ? "关闭音效" : "开启音效";
    items.push(sfxToggleLabel);
    actions.push(() => {
      const next = !this.data.sfxEnabled;
      this.setData({ sfxEnabled: next });
      wx.setStorageSync(SFX_ENABLED_KEY, next);
      wx.showToast({ title: next ? "音效已开启" : "音效已关闭", icon: "none" });
    });

    const hapticToggleLabel = this.data.hapticEnabled ? "关闭震动" : "开启震动";
    items.push(hapticToggleLabel);
    actions.push(() => {
      const next = !this.data.hapticEnabled;
      this.setData({ hapticEnabled: next });
      wx.setStorageSync(HAPTIC_ENABLED_KEY, next);
      wx.showToast({ title: next ? "震动已开启" : "震动已关闭", icon: "none" });
    });

    this.showActionSheetSafe({
      itemList: items,
      success: (res) => {
        const action = actions[res.tapIndex];
        if (action) action();
      },
      fail: () => {}
    });
  },

  openToolsOwnerMenu() {
    const items = [];
    const actions = [];

    if ((this.data.waitingPlayersRaw || []).length > 0) {
      items.push("等待者入座");
      actions.push(() => this.openWaitingAdmitFlow());
    }

    items.push("设置每人骰子数(下局)");
    actions.push(() => this.openDicePerPlayerModal());

    this.showActionSheetSafe({
      itemList: items.length ? items : ["暂无可用工具"],
      success: (res) => {
        const action = actions[res.tapIndex];
        if (action) action();
      },
      fail: () => {}
    });
  },

  openToolsTestMenu() {
    const items = ["设置随机种子", "注入下一次骰子(自己)"];
    const actions = [() => this.openTestSeedModal(), () => this.openTestNextDiceModal()];

    this.showActionSheetSafe({
      itemList: items,
      success: (res) => {
        const action = actions[res.tapIndex];
        if (action) action();
      },
      fail: () => {}
    });
  },

  openToolsDevMenu() {
    const items = ["打开首页"];
    const actions = [() => wx.switchTab({ url: "/pages/lobby/lobby" })];

    this.showActionSheetSafe({
      itemList: items,
      success: (res) => {
        const action = actions[res.tapIndex];
        if (action) action();
      },
      fail: () => {}
    });
  },

  openDicePerPlayerModal() {
    const current = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
      ? this.data.roomConfig.dicePerPlayer
      : Number(this.data.createDicePerPlayer) || 5;

    wx.showModal({
      title: "设置每人骰子数（下局生效）",
      editable: true,
      placeholderText: "1-10",
      content: String(current),
      success: (res) => {
        if (!res.confirm) return;
        const next = Number(String(res.content || "").trim());
        if (!Number.isInteger(next) || next < 1 || next > 10) {
          wx.showToast({ title: "骰子数不合法（1-10）", icon: "none" });
          return;
        }
        this.sendEvent("room:config:update", { dicePerPlayer: next });
      }
    });
  },

  openWaitingAdmitFlow() {
    const waiting = this.data.waitingPlayersRaw || [];
    const labels = waiting.map((p) => `${String(p.nickname || "等待").slice(0, 6)} (${String(p.id || "").slice(0, 6)})`);

    this.showActionSheetSafe({
      itemList: labels,
      success: (res) => {
        const picked = waiting[res.tapIndex];
        if (!picked) {
          return;
        }

        wx.showModal({
          title: "为等待者分配座位",
          editable: true,
          placeholderText: "输入空座位号 1-8",
          success: (modalRes) => {
            if (!modalRes.confirm) {
              return;
            }

            const seatIndex = Number(String(modalRes.content || "").trim());
            if (!Number.isInteger(seatIndex) || seatIndex < 1 || seatIndex > 8) {
              wx.showToast({ title: "座位号不合法", icon: "none" });
              return;
            }

            this.sendEvent("room:waiting:admit", {
              playerId: picked.id,
              seatIndex
            });
          }
        });
      }
    });
  },

  openDicePerPlayerModal() {
    const current = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
      ? this.data.roomConfig.dicePerPlayer
      : 5;

    wx.showModal({
      title: "设置每人骰子数",
      editable: true,
      placeholderText: "输入 1-10 的整数",
      content: `当前：${current}`,
      success: (res) => {
        if (!res.confirm) return;
        const next = Number(String(res.content || "").trim());
        if (!Number.isInteger(next) || next < 1 || next > 10) {
          wx.showToast({ title: "请输入 1-10 的整数", icon: "none" });
          return;
        }
        this.sendEvent("room:config:update", { dicePerPlayer: next });
      }
    });
  },

  openTestSeedModal() {
    wx.showModal({
      title: "设置随机种子",
      editable: true,
      placeholderText: "输入整数，如 123",
      success: (res) => {
        if (!res.confirm) return;
        const seed = Number(String(res.content || "").trim());
        if (!Number.isInteger(seed)) {
          wx.showToast({ title: "种子必须为整数", icon: "none" });
          return;
        }
        this.sendEvent("test:setSeed", { seed });
      }
    });
  },

  openTestNextDiceModal() {
    const expected = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
      ? this.data.roomConfig.dicePerPlayer
      : 5;

    wx.showModal({
      title: "注入下一次骰子",
      editable: true,
      placeholderText: `输入${expected}个点数，如 ${Array.from({ length: expected }, (_, i) => (i % 6) + 1).join(" ")}`,
      success: (res) => {
        if (!res.confirm) return;
        const raw = String(res.content || "").trim();
        const nums = raw.split(/\s+/).map((x) => Number(x)).filter((x) => Number.isFinite(x));
        if (nums.length !== expected || nums.some((x) => !Number.isInteger(x) || x < 1 || x > 6)) {
          wx.showToast({ title: `请输入${expected}个1-6的整数`, icon: "none" });
          return;
        }
        this.sendEvent("test:setNextDice", { dice: nums });
      }
    });
  },

  sendEvent(event, payload, options = {}) {
    if (!this.data.legalAccepted) {
      wx.showToast({ title: "请先同意隐私协议", icon: "none" });
      this.setData({ showLegalModal: true });
      return;
    }

    if (!this.socketTask || !this.data.connected) {
      wx.showToast({ title: "未连接", icon: "none" });
      return;
    }

    if (!this.actionEventMap) {
      this.actionEventMap = {};
    }

    const actionId = buildActionId();
    this.actionEventMap[actionId] = event;

    this.socketTask.send({
      data: JSON.stringify({
        event,
        payload,
        actionId
      }),
      success: () => {},
      fail: () => {
        delete this.actionEventMap[actionId];
        wx.showToast({ title: "发送失败", icon: "none" });
      }
    });
  },

  handleServerPacket(raw) {
    let packet;

    try {
      packet = JSON.parse(raw);
    } catch (error) {
      return;
    }

    const { event, payload } = packet;

    switch (event) {
      case "room:state": {
        const roomId = payload.roomId || this.data.roomId;
        const playersRaw = payload.players || [];
        const waitingPlayersRaw = payload.waitingPlayers || [];
        this.clearStoredSessionIfSelfMissing(roomId, playersRaw, waitingPlayersRaw);
        const roomConfig = payload.config || null;
        const playerCount = Array.isArray(playersRaw) ? playersRaw.length : 0;
        const validTargets = (this.data.selectedTargetIds || []).filter((id) => {
          return playersRaw.some((player) => player.id === id && player.id !== this.data.playerId);
        });
        const roomDirection = roomConfig && (roomConfig.direction === "ccw" ? "ccw" : "cw");
        const playersDecorated = decoratePlayers(playersRaw, this.data.playerId, validTargets, payload.lastCall, roomDirection);
        const ghostSeats = buildGhostSeats(playersDecorated, playersRaw.length);
        const self = playersRaw.find((player) => player.id === this.data.playerId);
        const selfIsOwner = Boolean(self && self.isOwner);
        const selfHasCalled = Boolean(self && self.currentCall);
        const selfRollLocked = Boolean(self && self.rollLocked);
        const selfRollCountThisRound = Number(self && self.rollCountThisRound) || 0;
        const selfAvatarUrl = (self && self.avatar) ? self.avatar : (this.data.avatarUrl || "");
        const selfIsWaiting = waitingPlayersRaw.some((player) => player.id === this.data.playerId)
          && !playersRaw.some((player) => player.id === this.data.playerId);
        const dicePerPlayer = roomConfig && typeof roomConfig.dicePerPlayer === "number"
          ? roomConfig.dicePerPlayer
          : 5;
        const maxCallCount = Math.max(1, playerCount * dicePerPlayer);
        const minOpeningCount = roomConfig && Number.isInteger(roomConfig.minOpeningCount)
          ? roomConfig.minOpeningCount
          : 1;

        const phase = payload.phase || "ready";
        const lastCallObj = payload.lastCall || null;
        const incomingRound = payload.round || 0;
        const previousPhase = String(this.data.phase || "ready");
        const previousRound = Number(this.data.round || 0);
        const roundStartSfxKey = `${String(roomId || "")}:${incomingRound}`;
        const shouldPlayRoundStartSfx = Boolean(
          this.hasReceivedRoomState
          && phase === "rolling"
          && incomingRound > 0
          && roundStartSfxKey !== this.lastRoundStartSfxKey
          && (
            previousPhase === "ready"
            || previousPhase === "ended"
            || previousRound !== incomingRound
          )
        );
        const turnKey = `${incomingRound}:${phase}:${payload.currentPlayerId || "-"}:${lastCallObj ? lastCallObj.ts : 0}`;

        if (phase === "calling") {
          this.resetTurnCountdown(turnKey);
        } else {
          this.clearTurnCountdown();
        }

        let callTimeline = Array.isArray(this.data.callTimeline) ? this.data.callTimeline : [];
        let lastCallKey = String(this.data.lastCallKey || "");
        const roundChanged = incomingRound !== this.data.round;
        if (roundChanged) {
          this.clearMyDiceTimers();
          this.resetSelfRollTransientState();
          callTimeline = [];
          lastCallKey = "";
        }
        if (selfIsWaiting && (this.data.myDiceRolling || this.data.myDiceRevealing)) {
          this.clearMyDiceTimers();
          this.resetSelfRollTransientState();
        }

        let lastByLabel = "-";
        if (lastCallObj) {
          const byPlayer = playersRaw.find((p) => p.id === lastCallObj.by);
          const byNameShort = byPlayer
            ? (safeDecodeComponent(byPlayer.nickname).trim() || "玩家").slice(0, 2)
            : String(lastCallObj.by || "").slice(0, 2);
          const bySeat = byPlayer ? byPlayer.seatIndex : 0;
          lastByLabel = `${bySeat ? `${bySeat}号` : ""}${byNameShort}`;

          const key = `${lastCallObj.by}_${lastCallObj.count}_${lastCallObj.point}_${lastCallObj.ts}`;
          if (key !== lastCallKey) {
            callTimeline = [{
              ts: lastCallObj.ts,
              by: lastCallObj.by,
              byLabel: lastByLabel,
              byShort: byNameShort,
              seatIndex: bySeat,
              count: lastCallObj.count,
              point: lastCallObj.point
            }, ...callTimeline].slice(0, 20);
            lastCallKey = key;
          }
        }

        const startActionEnabled = Boolean(selfIsOwner && phase === "ready" && playerCount >= 2);
        const startActionText = selfIsOwner ? "开始" : "等待房主";

        const isMyCallingTurn = payload.phase === "calling"
          && payload.currentPlayerId === this.data.playerId
          && !selfIsWaiting;
        const previousLastCallTs = this.data.lastCallObj ? Number(this.data.lastCallObj.ts) || 0 : 0;
        const nextLastCallTs = lastCallObj ? Number(lastCallObj.ts) || 0 : 0;
        const suggestedCall = buildSuggestedCallState(
          lastCallObj,
          minOpeningCount,
          maxCallCount,
          Number(this.data.callPoint) || 6
        );
        const shouldSyncCallInput = Boolean(
          isMyCallingTurn && (
            this.data.phase !== "calling"
            || this.data.currentPlayerId !== this.data.playerId
            || roundChanged
            || previousLastCallTs !== nextLastCallTs
          )
        );
        const nextCallCountNum = shouldSyncCallInput
          ? suggestedCall.count
          : this.clampNumber(Number(this.data.callCount), minOpeningCount, maxCallCount);
        const nextCallPointNum = shouldSyncCallInput
          ? suggestedCall.point
          : this.clampNumber(Number(this.data.callPoint), 1, 6);
        const nextCallCount = String(nextCallCountNum);
        const nextCallPoint = String(nextCallPointNum);
        const callCountOptions = this.buildCallCountOptions(nextCallCountNum, maxCallCount);
        const callForcedOpen = Boolean(isMyCallingTurn && suggestedCall.forcedOpen);
        const callPanelVisible = isMyCallingTurn ? Boolean(this.data.callPanelVisible) : false;
        const callPanelExpanded = isMyCallingTurn ? Boolean(this.data.callPanelExpanded) : false;
        const canOpenAction = Boolean(isMyCallingTurn && lastCallObj);

        const settlementVisible = Boolean(this.data.settlementVisible) && phase === "ended";
        if (!settlementVisible && this.data.settlementVisible) {
          this.clearSettlementCountdown();
          this.latestOpenResult = null;
          this.latestRoundSummary = null;
        }

        const hasDice = Array.isArray(this.data.privateDice) && this.data.privateDice.length === dicePerPlayer;
        const myDicePeekVisible = !selfIsWaiting && phase !== "ended" && !this.data.myDiceVisible && hasDice;
        const roomSelfDiceFaces = (this.data.myDiceRolling || this.data.myDiceRevealing)
          ? this.data.roomSelfDiceFaces
          : (hasDice ? buildDiceFaceItems(this.data.privateDice) : buildSelfDiceDisplayItems());

        let primaryActionText = "开始";
        let canPrimaryAction = false;
        if (selfIsWaiting) {
          primaryActionText = "旁观中";
          canPrimaryAction = false;
        } else if (phase === "ready") {
          primaryActionText = startActionText;
          canPrimaryAction = startActionEnabled;
        } else if (phase === "rolling") {
          if (!hasDice) {
            primaryActionText = "摇一摇";
            canPrimaryAction = true;
          } else if (!selfRollLocked) {
            primaryActionText = "OK";
            canPrimaryAction = true;
          } else {
            primaryActionText = "等待";
            canPrimaryAction = false;
          }
        } else if (phase === "opening") {
          primaryActionText = "开牌中";
          canPrimaryAction = false;
        } else if (phase === "ended") {
          if (payload.currentPlayerId === this.data.playerId) {
            primaryActionText = "开始";
            canPrimaryAction = true;
          } else {
            primaryActionText = "等待";
            canPrimaryAction = false;
          }
        } else if (phase === "calling") {
          if (payload.currentPlayerId === this.data.playerId) {
            primaryActionText = callForcedOpen ? "开牌" : "叫牌";
            canPrimaryAction = true;
          } else {
            primaryActionText = "等待";
            canPrimaryAction = false;
          }
        }

        const seatingSelectedSeatIndex = Number(this.data.seatingSelectedSeatIndex || 0);
        const seatRows = buildSeatRows(playersRaw, 8, seatingSelectedSeatIndex);
        const selectedRow = seatingSelectedSeatIndex ? seatRows.find((r) => r.seatIndex === seatingSelectedSeatIndex) : null;
        const seatingSelectedText = seatingSelectedSeatIndex
          ? (selectedRow && selectedRow.occupied
            ? `${seatingSelectedSeatIndex}号 ${String(selectedRow.label || "").split("（")[0]}`
            : `${seatingSelectedSeatIndex}号 空`)
          : "未选择";

        this.setData({
          roomId,
          displayRoomId: formatRoomIdDisplay(roomId),
          joinRoomId: roomId,
          phase: payload.phase || "ready",
          round: payload.round || 0,
          currentPlayerId: payload.currentPlayerId || "",
          lastCallObj,
          primaryActionText,
          canPrimaryAction,
          roomConfig,
          playersRaw,
          playersDecorated,
          ghostSeats,
          waitingPlayersRaw,
          selfIsWaiting,
          selfIsOwner,
          selfHasCalled,
          selfHasDice: (selfIsWaiting || roundChanged) ? false : hasDice,
          selfRollLocked,
          selfRollCountThisRound,
          selfAvatarUrl,
          playerCount,
          seatRows,
          seatingSelectedSeatIndex,
          seatingSelectedText,
          voiceItems: this.decorateVoiceItems(this.data.voiceItemsRaw, playersRaw),
          chatItems: this.decorateChatItems(this.data.chatItemsRaw, playersRaw, this.data.playerId),
          selectedTargetIds: validTargets,
          callCount: nextCallCount,
          callPoint: nextCallPoint,
          callCountOptions,
          maxCallCount,
          callForcedOpen,
          callSelectorMode: isMyCallingTurn ? (this.data.callSelectorMode || "count") : "",
          callPanelExpanded: isMyCallingTurn ? callPanelExpanded : false,
          callPanelVisible,
          canOpenAction,
          settlementVisible,
          settlementSummaryText: settlementVisible ? this.data.settlementSummaryText : "",
          settlementDeclaredText: settlementVisible ? this.data.settlementDeclaredText : "",
          settlementActualText: settlementVisible ? this.data.settlementActualText : "",
          settlementPointAsset: settlementVisible ? this.data.settlementPointAsset : "",
          settlementRows: settlementVisible ? this.data.settlementRows : [],
          settlementCanContinue: settlementVisible ? this.data.settlementCanContinue : false,
          settlementContinueSec: settlementVisible ? this.data.settlementContinueSec : 0,
          privateDice: (selfIsWaiting || roundChanged) ? [] : this.data.privateDice,
          callTimeline,
          lastCallKey,
          turnCountdownSec: this.data.turnCountdownSec,
          roomSelfDiceFaces: (selfIsWaiting || roundChanged) ? buildSelfDiceDisplayItems() : roomSelfDiceFaces,
          myDiceVisible: (selfIsWaiting || phase === "ended" || roundChanged) ? false : this.data.myDiceVisible,
          myDicePeekVisible: selfIsWaiting ? false : myDicePeekVisible,
          myDiceRolling: (selfIsWaiting || phase === "ended" || roundChanged) ? false : this.data.myDiceRolling,
          myDiceRevealing: (selfIsWaiting || phase === "ended" || roundChanged) ? false : this.data.myDiceRevealing,
          myDiceJustRevealed: (selfIsWaiting || roundChanged) ? false : this.data.myDiceJustRevealed
        });

        this.hasReceivedRoomState = true;
        if (shouldPlayRoundStartSfx) {
          this.lastRoundStartSfxKey = roundStartSfxKey;
          this.playSfx("roundStart");
        }

        break;
      }
      case "chat:list": {
        const items = Array.isArray(payload.items) ? payload.items : [];
        const trimmed = items.slice(-80);
        this.setData({
          chatItemsRaw: trimmed,
          chatItems: this.decorateChatItems(trimmed, this.data.playersRaw, this.data.playerId)
        });
        break;
      }
      case "chat:new": {
        const message = payload.message;
        if (!message || !message.id) {
          break;
        }

        const existing = Array.isArray(this.data.chatItemsRaw) ? this.data.chatItemsRaw : [];
        const merged = [...existing, message]
          .filter((m, idx, arr) => arr.findIndex((x) => x.id === m.id) === idx)
          .slice(-80);

        const isSelf = String(message.playerId || "") === String(this.data.playerId || "");
        const nextUnread = this.data.chatVisible || isSelf
          ? 0
          : Math.min(99, Number(this.data.chatUnreadCount || 0) + 1);

        this.setData({
          chatItemsRaw: merged,
          chatItems: this.decorateChatItems(merged, this.data.playersRaw, this.data.playerId),
          chatUnreadCount: nextUnread
        });

        break;
      }
      case "action:ack": {
        const actionId = payload.actionId;
        const actionEvent = actionId ? this.actionEventMap[actionId] : "";
        if (actionId) {
          delete this.actionEventMap[actionId];
        }

        if (actionId && actionId === this.pendingLeaveActionId) {
          this.finalizeLeaveRoom();
          break;
        }

        if (payload.roomId || payload.playerId || payload.resumeToken) {
          const nextData = {
            roomId: payload.roomId || this.data.roomId,
            displayRoomId: formatRoomIdDisplay(payload.roomId || this.data.roomId),
            playerId: payload.playerId || this.data.playerId,
            resumeToken: payload.resumeToken || this.data.resumeToken,
            joinRoomId: payload.roomId || this.data.joinRoomId
          };

          this.setData({
            ...nextData
          });
          this.persistSession(nextData);
        }

        if (!payload.ok) {
          if (
            actionEvent === "room:rejoin" &&
            (payload.code === "ROOM_NOT_FOUND" || payload.code === "PLAYER_NOT_IN_ROOM" || payload.code === "FORBIDDEN")
          ) {
            this.clearSession();
            this.resetRoomView();
          }

          const code = String(payload.code || "");
          const reason = String(payload.reason || "操作失败");
          const failText = code ? `${code}: ${reason}` : reason;

          this.setData({ lastWsError: failText });
          this.refreshWsHint(failText);

          if (actionEvent === "room:join" && payload.code === "ROOM_NOT_FOUND") {
            wx.showToast({ title: "房间不存在或房间号有误", icon: "none", duration: 5000 });
          } else {
            wx.showToast({ title: reason, icon: "none" });
          }
        }

        break;
      }
      case "dice:privateResult": {
        const expected = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
          ? this.data.roomConfig.dicePerPlayer
          : 5;

        const privateDice = payload.dice || [];
        const cleaned = Array.isArray(privateDice) ? privateDice.slice(0, expected).map((n) => Number(n)) : [];
        const ok = cleaned.length === expected && cleaned.every((n) => Number.isInteger(n) && n >= 1 && n <= 6);
        const finalDice = ok ? cleaned : [];

        this.pendingPrivateDice = finalDice.slice();
        this.setData({
          privateDice: finalDice,
          selfHasDice: finalDice.length === expected,
          myDiceVisible: !this.data.selfIsWaiting && this.data.phase !== "ended",
          myDicePeekVisible: false
        });

        if (!this.data.myDiceRolling && !this.data.myDiceRevealing) {
          this.clearMyDiceTimers();
          this.setData({
            myDiceRolling: false,
            myDiceRevealing: false,
            myDiceJustRevealed: true,
            roomSelfDiceFaces: buildDiceFaceItems(finalDice.length === expected
              ? finalDice
              : buildSelfDiceFallback(expected))
          });

          this.myDiceRevealTimer = setTimeout(() => {
            this.setData({ myDiceJustRevealed: false });
            this.myDiceRevealTimer = null;
          }, this.getSelfRollSettleDurationMs());
          break;
        }

        this.maybeStartSelfRollReveal(expected);

        break;
      }
      case "history:list": {
        const incoming = normalizeHistoryItems(payload.items);
        const current = this.data.historyItems || [];

        const merged = this.data.historyAppendMode
          ? [...current, ...incoming]
          : incoming;

        this.setData({
          historyItems: merged,
          historyNextBeforeRound: payload.nextBeforeRound || null,
          historyAppendMode: false
        });

        break;
      }
      case "open:result": {
        const targets = Array.isArray(payload.targets) ? payload.targets : [];
        const first = targets[0];
        if (first) {
          const winnerShort = String(first.winnerId || "").slice(0, 6) || "-";

          this.showSettlementPanel(payload, null);
        }
        break;
      }
      case "round:summary": {
        const players = Array.isArray(payload.players) ? payload.players : [];
        const playerMap = new Map((this.data.playersRaw || []).map((p) => [p.id, p]));
        const diceChars = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

        const line = players.map((p) => {
          const info = playerMap.get(p.playerId);
          const seat = info ? info.seatIndex : "-";
          const name = info
            ? (safeDecodeComponent(info.nickname).trim() || String(info.id || "").slice(0, 2)).slice(0, 2)
            : String(p.playerId || "").slice(0, 2);
          const dice = Array.isArray(p.dice) ? p.dice.join("") : "";
          return `${seat}${name}:${dice}`;
        }).join(" | ");

        this.showSettlementPanel(null, payload);
        break;
      }
      case "voice:uploaded": {
        const who = String(payload.playerId || "").slice(0, 8);
        const sec = Math.max(1, Math.round(Number(payload.durationMs || 0) / 1000));
        this.loadVoiceList();
        break;
      }
      case "voice:list": {
        const rawItems = Array.isArray(payload.items) ? payload.items : [];
        this.setData({
          voiceItemsRaw: rawItems,
          voiceItems: this.decorateVoiceItems(rawItems, this.data.playersRaw)
        });
        break;
      }
      case "voice:fetched": {
        this.handleVoiceFetched(payload).catch(() => {
          wx.showToast({ title: "语音播放失败", icon: "none" });
          this.setData({
            playingVoiceId: "",
            playingVoiceTip: "点击语音可播放"
          });
        });
        break;
      }
      case "system:error": {
        this.debugClientEvent("system:error", {
          message: payload && payload.message ? String(payload.message) : ""
        }, { ui: false });
        break;
      }
      default:
        break;
    }
  },

  decorateVoiceItems(itemsRaw, playersRaw) {
    const players = Array.isArray(playersRaw) ? playersRaw : [];
    const playerMap = new Map(players.map((player) => [player.id, safeDecodeComponent(player.nickname).trim() || player.id]));

    return (itemsRaw || []).map((item) => {
      const nickname = playerMap.get(item.playerId) || String(item.playerId || "").slice(0, 8);
      const seconds = Math.max(1, Math.round(Number(item.durationMs || 0) / 1000));

      return {
        ...item,
        nicknameShort: String(nickname).slice(0, 4),
        timeText: formatClock(item.createdAt),
        durationText: `${seconds}s`
      };
    });
  },

  decorateChatItems(itemsRaw, playersRaw, selfPlayerId) {
    const players = Array.isArray(playersRaw) ? playersRaw : [];
    const playerMap = new Map(players.map((player) => [player.id, safeDecodeComponent(player.nickname).trim() || player.id]));

    return (itemsRaw || []).map((item) => {
      const playerId = String(item.playerId || "");
      const nickname = playerMap.get(playerId) || playerId.slice(0, 8) || "玩家";
      const isSelf = selfPlayerId && playerId === String(selfPlayerId);
      const createdAt = Number(item.createdAt || 0);
      return {
        ...item,
        nicknameShort: String(nickname).slice(0, 4),
        timeText: formatClock(createdAt),
        isSelf
      };
    });
  },

  async handleVoiceFetched(payload) {
    const fileId = payload.fileId;
    if (!fileId || !payload.base64) {
      throw new Error("invalid voice payload");
    }

    const ext = mimeToExt(payload.mimeType);
    const path = `${wx.env.USER_DATA_PATH}/voice_${fileId}.${ext}`;
    await writeBase64ToFile(path, payload.base64);
    this.voiceTempMap[fileId] = path;

    if (this.pendingVoiceFileId && this.pendingVoiceFileId !== fileId) {
      return;
    }

    this.pendingVoiceFileId = "";
    this.playVoiceFile(fileId, path);
  },

  updateSelectedTargets(nextIds) {
    const playersDecorated = this.buildPlayersDecorated(this.data.playersRaw, nextIds, this.data.lastCallObj);
    this.setData({
      selectedTargetIds: nextIds,
      playersDecorated,
      ghostSeats: buildGhostSeats(playersDecorated, this.data.playersRaw.length)
    });
  },

  buildPlayersDecorated(playersRaw, selectedTargetIds = this.data.selectedTargetIds, lastCall = this.data.lastCallObj) {
    const roomDirection = this.data.roomConfig && this.data.roomConfig.direction === "ccw" ? "ccw" : "cw";
    return decoratePlayers(playersRaw, this.data.playerId, selectedTargetIds, lastCall, roomDirection);
  },

  onSeatAvatarError(event) {
    const playerId = String((event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id) || "");
    if (!playerId) {
      return;
    }

    const playersRaw = (this.data.playersRaw || []).map((player) => {
      if (String(player.id || "") !== playerId || !player.avatar) {
        return player;
      }
      return { ...player, avatar: "" };
    });
    const playersDecorated = this.buildPlayersDecorated(playersRaw);

    this.setData({
      playersRaw,
      playersDecorated,
      ghostSeats: buildGhostSeats(playersDecorated, playersRaw.length),
      ...(playerId === String(this.data.playerId || "") ? { selfAvatarUrl: "" } : {})
    });
  },

  onSelfAvatarError() {
    this.setData({ selfAvatarUrl: "" });
  },

  async ensureSfxFiles() {
    if (!this.sfxContext || !wx.env || !wx.env.USER_DATA_PATH || typeof wx.getFileSystemManager !== "function") {
      this.sfxPaths = {
        roll: ROOM_AUDIO_ASSETS.roll,
        settlement: ROOM_AUDIO_ASSETS.settlement,
        primary: ROOM_AUDIO_ASSETS.primary,
        roundStart: ROOM_AUDIO_ASSETS.roundStart
      };
      return;
    }

    const base = wx.env.USER_DATA_PATH;
    const keys = ["ok", "call", "open", "win", "lose"];

    const nextPaths = {
      roll: ROOM_AUDIO_ASSETS.roll,
      settlement: ROOM_AUDIO_ASSETS.settlement,
      primary: ROOM_AUDIO_ASSETS.primary,
      roundStart: ROOM_AUDIO_ASSETS.roundStart
    };
    for (const key of keys) {
      const path = `${base}/dice_sfx_${key}.wav`;
      try {
        const buffer = buildWavSfx(key);
        await writeArrayBufferToFile(path, buffer);
      } catch (error) {
        // ignore sfx write failures (still playable without)
      }
      nextPaths[key] = path;
    }

    this.sfxPaths = nextPaths;
  },

  playSfx(kind) {
    if (!this.data.sfxEnabled) {
      return;
    }
    if (!this.sfxContext || !this.sfxPaths) {
      return;
    }
    const path = this.sfxPaths[kind];
    if (!path) {
      return;
    }
    try {
      this.sfxContext.stop();
      this.sfxContext.src = path;
      this.sfxContext.play();
    } catch (error) {
      // ignore play failure
    }
  },

  playPrimaryAwareSfx(fallbackKind = "") {
    if (fallbackKind) {
      this.playSfx(fallbackKind);
    }
  },

  noop() {},

  haptic(type = "light") {
    if (!this.data.hapticEnabled) {
      return;
    }
    try {
      wx.vibrateShort({ type });
    } catch (error) {
      try {
        wx.vibrateShort();
      } catch (error) {
        // ignore
      }
    }
  },

  openCallPanel() {
    if (this.data.phase !== "calling" || this.data.currentPlayerId !== this.data.playerId || this.data.selfIsWaiting) {
      return;
    }
    this.setData({
      callPanelVisible: true,
      callPanelExpanded: true,
      callSelectorMode: this.data.callSelectorMode || "count"
    });
  },

  closeCallPanel() {
    this.setData({
      callPanelVisible: false,
      callPanelExpanded: false
    });
  },

  clampNumber(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
  },

  buildCallCountOptions(currentValue, maxValue = this.getMaxCallCount()) {
    const max = Math.max(1, Number(maxValue) || 1);
    const configMin = this.data.roomConfig && Number.isInteger(this.data.roomConfig.minOpeningCount)
      ? this.data.roomConfig.minOpeningCount
      : 1;
    return buildCallCountOptionItems(currentValue, max, configMin);
  },

	  getMaxCallCount() {
	    const playerCount = Array.isArray(this.data.playersRaw) ? this.data.playersRaw.length : 0;
	    const dicePerPlayer = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
	      ? this.data.roomConfig.dicePerPlayer
	      : 5;
	    return Math.max(1, playerCount * dicePerPlayer);
	  },

  incCallCount() {
    const max = this.getMaxCallCount();
    const next = this.clampNumber(Number(this.data.callCount) + 1, 1, max);
    this.setData({
      callCount: String(next),
      callCountOptions: this.buildCallCountOptions(next, max)
    });
  },

  decCallCount() {
    const max = this.getMaxCallCount();
    const min = 1;
    const next = this.clampNumber(Number(this.data.callCount) - 1, min, max);
    this.setData({
      callCount: String(next),
      callCountOptions: this.buildCallCountOptions(next, max)
    });
  },

  incCallPoint() {
    const current = this.clampNumber(Number(this.data.callPoint), 1, 6);
    const next = current >= 6 ? 1 : current + 1;
    this.setData({ callPoint: String(next) });
  },

  decCallPoint() {
    const current = this.clampNumber(Number(this.data.callPoint), 1, 6);
    const next = current <= 1 ? 6 : current - 1;
    this.setData({ callPoint: String(next) });
  },

	  applyMinLegalCall() {
	    const last = this.data.lastCallObj;
	    const max = this.getMaxCallCount();
	    const minOpeningCount = this.data.roomConfig && Number.isInteger(this.data.roomConfig.minOpeningCount)
	      ? this.data.roomConfig.minOpeningCount
	      : 1;

    if (!last) {
      const base = this.clampNumber(Number(this.data.callCount), minOpeningCount, max);
      this.setData({
        callCount: String(base),
        callPoint: String(this.clampNumber(Number(this.data.callPoint), 1, 6)),
        callCountOptions: this.buildCallCountOptions(base, max)
      });
      return;
    }

	    let nextCount = Number(last.count);
	    let nextPoint = Number(last.point);
	    if (!Number.isInteger(nextCount) || !Number.isInteger(nextPoint)) {
	      wx.showToast({ title: "上一手叫牌信息异常", icon: "none" });
	      return;
	    }
	    if (nextCount === max && nextPoint === 6) {
	      wx.showToast({ title: "已到上限，下家只能开牌", icon: "none" });
	      return;
	    }

	    if (nextPoint < 6) {
	      nextPoint += 1;
	    } else {
	      nextCount += 1;
	      nextPoint = 2;
	    }

	    if (nextCount > max) {
	      wx.showToast({ title: "已到数量上限，下家只能开牌", icon: "none" });
	      return;
	    }

    this.setData({
      callCount: String(nextCount),
      callPoint: String(nextPoint),
      callCountOptions: this.buildCallCountOptions(nextCount, max)
    });
  },

  resetRoomView() {
    if (this.audioContext) {
      this.audioContext.stop();
    }
    this.clearMyDiceTimers();
    this.resetSelfRollTransientState();
    this.clearSettlementCountdown();
    this.latestOpenResult = null;
    this.latestRoundSummary = null;
    this.hasReceivedRoomState = false;
    this.lastRoundStartSfxKey = "";

    this.pendingVoiceFileId = "";
    this.clearPendingRoomAction();

    this.setData({
      roomId: "",
      displayRoomId: "------",
      playerId: "",
      resumeToken: "",
      phase: "ready",
      round: 0,
      currentPlayerId: "",
      lastCallObj: null,
      primaryActionText: "开始",
      canPrimaryAction: false,
      roomConfig: null,
      playersRaw: [],
      playersDecorated: [],
      ghostSeats: [],
      waitingPlayersRaw: [],
      selfIsWaiting: false,
      selfIsOwner: false,
      selfHasDice: false,
      selfHasCalled: false,
      selfRollLocked: false,
      selfRollCountThisRound: 0,
      playerCount: 0,
      selectedTargetIds: [],
      privateDice: [],
      settlementVisible: false,
      settlementSummaryText: "",
      settlementDeclaredText: "",
      settlementActualText: "",
      settlementPointAsset: "",
      settlementRows: [],
      settlementCanContinue: false,
      settlementContinueSec: 0,
      lastCallKey: "",
      callTimeline: [],
      myDiceVisible: false,
      myDicePeekVisible: false,
      myDiceRolling: false,
      myDiceRevealing: false,
      myDiceJustRevealed: false,
      roomSelfDiceFaces: buildSelfDiceDisplayItems(),
      historyItems: [],
      historyNextBeforeRound: null,
      historyVisible: false,
      voiceItemsRaw: [],
      voiceItems: [],
      voiceVisible: false,
      chatVisible: false,
      playingVoiceId: "",
      playingVoiceTip: "点击语音可播放",
      callCount: "3",
      callPoint: "6",
      callCountOptions: buildCallCountOptionItems(3, 8, 1),
      maxCallCount: 1,
      callPointOptions: ["1", "2", "3", "4", "5", "6"],
      callForcedOpen: false,
      callSelectorMode: "",
      callPanelExpanded: false,
      callPanelVisible: false,
      canOpenAction: false,
      seatingVisible: false,
      seatingSelectedSeatIndex: 0,
      seatingSelectedText: "未选择",
      seatRows: [],
      pendingActionText: ""
    });
  },

  clearPendingLeaveRequest() {
    if (this.pendingLeaveTimer) {
      clearTimeout(this.pendingLeaveTimer);
      this.pendingLeaveTimer = null;
    }
    this.pendingLeaveActionId = "";
  },

  finalizeLeaveRoom() {
    if (this.leaveFinalized) {
      return;
    }

    this.leaveFinalized = true;
    this.clearPendingLeaveRequest();
    this.skipAutoReconnectOnce = true;
    this.manualClose = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socketTask) {
      try {
        this.socketTask.close({});
      } catch (error) {
        // ignore
      }
      this.stopHeartbeat();
      this.socketTask = null;
    }

    this.clearSession();
    this.resetRoomView();
    wx.reLaunch({ url: "/pages/lobby/lobby" });
  },

  notifyServerLeave(options = {}) {
    const {
      reason = "manual_leave",
      finalizeOnSendFail = false
    } = options;

    this.debugClientEvent("room:leave", {
      roomId: this.data.roomId,
      playerId: this.data.playerId,
      socketId: this.activeSocketId,
      reason
    });

    if (!this.socketTask || !this.data.connected) {
      return "";
    }

    if (!this.actionEventMap) {
      this.actionEventMap = {};
    }

    const actionId = buildActionId();
    this.actionEventMap[actionId] = "room:leave";

    try {
      this.socketTask.send({
        data: JSON.stringify({
          event: "room:leave",
          payload: {},
          actionId
        }),
        success: () => {},
        fail: () => {
          delete this.actionEventMap[actionId];
          if (finalizeOnSendFail) {
            this.finalizeLeaveRoom();
          }
        }
      });
    } catch (error) {
      delete this.actionEventMap[actionId];
      if (finalizeOnSendFail) {
        this.finalizeLeaveRoom();
      }
      return "";
    }

    return actionId;
  },

  clearStoredSessionIfSelfMissing(roomId, playersRaw, waitingPlayersRaw) {
    const currentRoomId = String(roomId || this.data.roomId || "");
    const currentPlayerId = String(this.data.playerId || "");
    const currentResumeToken = String(this.data.resumeToken || "");

    if (!currentRoomId || !currentPlayerId || !currentResumeToken || this.pendingRoomAction || this.pendingLeaveActionId) {
      return;
    }

    const isInPlayers = Array.isArray(playersRaw) && playersRaw.some((player) => player.id === currentPlayerId);
    const isInWaiting = Array.isArray(waitingPlayersRaw) && waitingPlayersRaw.some((player) => player.id === currentPlayerId);

    if (isInPlayers || isInWaiting) {
      return;
    }

    const cached = wx.getStorageSync(SESSION_KEY);
    if (cached && cached.roomId === currentRoomId && cached.playerId === currentPlayerId) {
      wx.removeStorageSync(SESSION_KEY);
    }
  },

  persistSession(sessionLike) {
    const roomId = sessionLike.roomId || this.data.roomId;
    const playerId = sessionLike.playerId || this.data.playerId;
    const resumeToken = sessionLike.resumeToken || this.data.resumeToken;

    if (!roomId || !playerId || !resumeToken) {
      return;
    }

    wx.setStorageSync(SESSION_KEY, {
      roomId,
      playerId,
      resumeToken
    });
  },

  clearSession() {
    wx.removeStorageSync(SESSION_KEY);
    this.voiceTempMap = {};
    this.pendingVoiceFileId = "";
    this.clearPendingRoomAction();
    this.clearMyDiceTimers();
    this.resetSelfRollTransientState();
    this.clearSettlementCountdown();
    this.latestOpenResult = null;
    this.latestRoundSummary = null;

    this.setData({
      roomId: "",
      displayRoomId: "------",
      playerId: "",
      resumeToken: "",
      joinRoomId: "",
      playerCount: 0,
      selfAvatarUrl: this.data.avatarUrl || "",
      settlementVisible: false,
      settlementSummaryText: "",
      settlementDeclaredText: "",
      settlementActualText: "",
      settlementPointAsset: "",
      settlementRows: [],
      settlementCanContinue: false,
      settlementContinueSec: 0,
      callCount: "3",
      callPoint: "6",
      callCountOptions: buildCallCountOptionItems(3, 8, 1),
      callForcedOpen: false,
      callSelectorMode: "",
      callPanelExpanded: false,
      callPanelVisible: false,
      canOpenAction: false,
      seatingVisible: false,
      seatingSelectedSeatIndex: 0,
      seatingSelectedText: "未选择",
      seatRows: [],
      pendingActionText: "",
      lastCallKey: "",
      callTimeline: [],
      myDiceVisible: false,
      myDicePeekVisible: false,
      myDiceRolling: false,
      myDiceRevealing: false,
      myDiceJustRevealed: false,
      roomSelfDiceFaces: buildSelfDiceDisplayItems(),
      selfRollLocked: false,
      selfRollCountThisRound: 0,
    });
  },

  openPrivacyPage() {
    wx.navigateTo({
      url: "/pages/legal/privacy/privacy"
    });
  },

  openTermsPage() {
    wx.navigateTo({
      url: "/pages/legal/terms/terms"
    });
  },

  openWsConfig() {
    wx.showModal({
      title: "设置服务器地址",
      editable: true,
      placeholderText: "ws://192.168.1.23:3000/ws",
      content: this.data.wsUrl || "",
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        const nextUrl = String(res.content || "").trim();
        if (!/^wss?:\/\/.+/i.test(nextUrl)) {
          wx.showToast({ title: "地址格式错误", icon: "none" });
          return;
        }

        this.applyWsUrl(nextUrl);
      }
    });
  },

  applyWsUrl(nextUrl) {
    this.setData({
      wsUrl: nextUrl,
      lastWsError: ""
    });
    this.debugClientEvent("ws:url_updated", {
      nextUrl,
      socketId: this.activeSocketId,
      roomId: this.data.roomId,
      playerId: this.data.playerId
    });
    app.globalData.wsUrl = nextUrl;
    wx.setStorageSync(WS_URL_KEY, nextUrl);
    this.refreshWsHint("");

    wx.showToast({ title: "地址已更新", icon: "none" });

    if (!this.socketTask) {
      this.connectSocket();
      return;
    }

    this.skipAutoReconnectOnce = true;
    this.manualClose = true;
    this.socketTask.close({});
    this.stopHeartbeat();
    this.socketTask = null;

    this.setData({
      connected: false,
      connecting: false,
      networkStatusText: "正在重连"
    });

    setTimeout(() => {
      this.manualClose = false;
      this.connectSocket();
    }, 200);
  },

  acceptLegal() {
    const payload = {
      accepted: true,
      version: "1.0.0",
      acceptedAt: Date.now()
    };
    wx.setStorageSync(LEGAL_ACCEPT_KEY, payload);

    this.setData({
      legalAccepted: true,
      showLegalModal: false
    });

    if (!this.data.connected && !this.data.connecting) {
      if (this.handleMissingConnectionConfig()) {
        return;
      }
      if (this.handleBlockedAutoConnect()) {
        return;
      }
      this.connectSocket();
    }
  },

  declineLegal() {
    wx.showToast({ title: "同意后方可继续使用", icon: "none" });
  },

  getRouteStack() {
    try {
      return getCurrentPages().map((page) => page.route);
    } catch (error) {
      return [];
    }
  },

  debugClientEvent(event, details = {}, options = {}) {
    const payload = {
      event,
      roomId: this.data && this.data.roomId ? this.data.roomId : "",
      playerId: this.data && this.data.playerId ? this.data.playerId : "",
      ...details
    };

    const verboseEvent = String(event || "").startsWith("lifecycle:") || String(event || "").endsWith("_stale");
    const shouldLogConsole = options && options.console === false
      ? false
      : !verboseEvent;

    if (shouldLogConsole) {
      try {
        // eslint-disable-next-line no-console
        console.log(`[dice-miniapp] ${event} ${JSON.stringify(payload)}`);
      } catch (error) {
        // ignore logging failure
      }
    }

  }
});
