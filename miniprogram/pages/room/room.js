const app = getApp();
const { LEGAL_ACCEPT_KEY, WS_URL_KEY, SESSION_KEY, NICKNAME_KEY, AVATAR_URL_KEY, SFX_ENABLED_KEY, HAPTIC_ENABLED_KEY } = require("../../utils/constants");
const { resolveSeatCupToneClass } = require("../../utils/room-view");
const ROOM_ASSETS = {
  avatarA: "/assets/figma-room-v2/39b17e1f-9114-410f-85d5-2e5a189fbf74.svg",
  avatarB: "/assets/figma-room-v2/7ca66ac8-3c55-4b22-ae77-b2bf38f68295.svg",
  avatarC: "/assets/figma-room-v2/c34dc9c6-7896-4b4d-adbe-c1e0c86f2471.svg",
  avatarD: "/assets/figma-room-v2/210fcfda-928e-4840-a3e3-173c823b96b8.svg",
  avatarE: "/assets/figma-room-v2/fae378fc-f9e8-496b-a6c8-fee07102a3e1.svg",
  avatarF: "/assets/figma-room-v2/bf7e06ef-5ad9-474e-b2b3-6bbd604fb91f.svg"
};

const FIGMA_DIE_ASSETS = {
  1: "/assets/figma-room-v2/87c0efa4-6afb-4f01-aa86-041b0f6969d7.svg",
  2: "/assets/figma-room-v2/e7672a33-634f-4afd-b16a-b409ec77521b.svg",
  3: "/assets/figma-room-v2/die-face-3-compact.svg",
  4: "/assets/figma-room-v2/a9fe600f-ca19-456b-8634-97fbbf275ddb.svg",
  5: "/assets/figma-room-v2/9b8ee1a1-733d-4cea-bae9-76357c6c7fc8.svg",
  6: "/assets/figma-room-v2/9bf57bd7-be8a-4d22-ace0-a345efa7effb.svg"
};

const FIGMA_DIE_3D_ASSET = "/assets/figma-room-v2/die-cube-gold.svg";

const FIGMA_SELF_DICE_PLACEHOLDER = [2, 4, 5, 2, 6];

function getFigmaDieAsset(point) {
  const key = Number(point);
  return FIGMA_DIE_ASSETS[key] || "";
}

function buildSelfDiceFallback(count = FIGMA_SELF_DICE_PLACEHOLDER.length) {
  const size = Number(count);
  const expected = Number.isInteger(size) && size > 0 ? size : FIGMA_SELF_DICE_PLACEHOLDER.length;
  return Array.from({ length: expected }, (_, index) => FIGMA_SELF_DICE_PLACEHOLDER[index % FIGMA_SELF_DICE_PLACEHOLDER.length]);
}

function buildSelfDiceDisplayItems() {
  return Array.from({ length: 5 }, (_, index) => ({
    value: 0,
    asset: FIGMA_DIE_3D_ASSET,
    stackClass: `stack-${index % 5}`
  }));
}

function buildDiceFaceItems(values) {
  return (Array.isArray(values) ? values : []).map((value, index) => ({
    value: Number(value) || 0,
    asset: getFigmaDieAsset(value),
    stackClass: `stack-${index % 5}`
  }));
}

function buildSettlementDiceItems(values, highlightValue = 0) {
  return (Array.isArray(values) ? values : []).map((value, index) => {
    const num = Number(value) || 0;
    return {
      value: num,
      asset: getFigmaDieAsset(num),
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

const FIGMA_SCORE_FALLBACKS = [12500, 9800, 14200, 21000, 8700, 15400, 10500, 28000];

const DICE_FACE_SYMBOLS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

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
    declaredText: `${declaredCount}个 ${declaredFace}`,
    actualText: `${actualCount}个 ${declaredFace}`,
    rows
  };
}

function phaseToText(phase) {
  const map = {
    ready: "准备阶段",
    rolling: "摇骰阶段",
    calling: "叫牌阶段",
    opening: "开牌中",
    ended: "结算完成"
  };

  return map[phase] || "准备阶段";
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
    { x: 187.5, y: 182, bx: 242, by: 188, cupX: 187.5, cupY: 232.5, cupAlign: "bottom", slotClass: "slot-top" },
    { x: 32, y: 324, bx: 79, by: 274, cupX: 99, cupY: 324.5, cupAlign: "right", slotClass: "slot-upper-left" },
    { x: 343, y: 326, bx: 297, by: 274, cupX: 278, cupY: 322.5, cupAlign: "left", slotClass: "slot-upper-right" },
    { x: 31, y: 460, bx: 79, by: 420, cupX: 101, cupY: 430.5, cupAlign: "right", slotClass: "slot-mid-left" },
    { x: 344, y: 460, bx: 296, by: 420, cupX: 274, cupY: 430.5, cupAlign: "left", slotClass: "slot-mid-right" },
    { x: 31, y: 596, bx: 79, by: 554, cupX: 101, cupY: 566, cupAlign: "right", slotClass: "slot-lower-left" },
    { x: 344, y: 596, bx: 296, by: 554, cupX: 274, cupY: 566, cupAlign: "left", slotClass: "slot-lower-right" },
    { x: 187.5, y: 792, bx: 187.5, by: 724, cupX: 187.5, cupY: 724, cupAlign: "top", slotClass: "slot-bottom" }
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
  return buildDiceFaceItems(options);
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

function formatScoreText(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "";
  return String(Math.round(num));
}

function resolvePlayerScoreText(player, fallbackIndex = 0, preferSelfFallback = false) {
  const source = player && typeof player === "object" ? player : {};
  const candidates = [
    source.score,
    source.coins,
    source.gold,
    source.chips,
    source.balance,
    source.amount,
    source.points
  ];

  for (const value of candidates) {
    const formatted = formatScoreText(value);
    if (formatted) {
      return formatted;
    }
  }

  if (preferSelfFallback) {
    return String(FIGMA_SCORE_FALLBACKS[FIGMA_SCORE_FALLBACKS.length - 1]);
  }

  const normalizedIndex = Math.abs(Number(fallbackIndex) || 0) % FIGMA_SCORE_FALLBACKS.length;
  return String(FIGMA_SCORE_FALLBACKS[normalizedIndex]);
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
    const badgeClass = player.isOwner ? "badge-owner" : "badge-seat";
    const isHeroSlot = geometry.slotClass === "slot-top";
    const avatarPresentation = getSeatAvatarPresentation(player.avatar, slotIndex);
    const scoreText = resolvePlayerScoreText(player, slotIndex, isSelf);

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
      badgeClass,
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
      callPointAsset: getFigmaDieAsset(callPoint),
      scoreText,
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
      ? `${occupantName.slice(0, 6)}（${String(occupant.id || "").slice(0, 6)}）`
      : "空";

    let actionText = "点此选中";
    let hintClass = "";
    const selected = Boolean(selectedSeat && seatIndex === selectedSeat);

    if (selected) {
      actionText = "已选中";
      hintClass = "hint-selected";
    } else if (selectedSeat) {
      const occupied = Boolean(occupant && occupant.id);
      if (!selectedOccupied && occupied) {
        actionText = "点此移入";
        hintClass = "hint-move-in";
      } else if (selectedOccupied && !occupied) {
        actionText = "点此移出";
        hintClass = "hint-move-out";
      } else if (selectedOccupied && occupied) {
        actionText = "点此交换";
        hintClass = "hint-swap";
      } else {
        actionText = "点此选中";
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

  const tone = ({ frequencyHz, durationMs, volume = 0.35 }) => {
    const duration = Math.max(30, Number(durationMs || 0));
    const sampleCount = Math.max(1, Math.floor((sampleRate * duration) / 1000));
    const freq = Math.max(80, Number(frequencyHz || 440));
    const amp = Math.max(0, Math.min(1, Number(volume))) * 0.9;
    const fadeSamples = Math.min(sampleCount, Math.floor(sampleRate * 0.01));

    return buildWavPcm16({
      sampleRate,
      samples: sampleCount,
      sampleAt: (i, sr) => {
        const t = i / sr;
        let env = 1;
        if (i < fadeSamples) env = i / fadeSamples;
        else if (sampleCount - i < fadeSamples) env = (sampleCount - i) / fadeSamples;
        return Math.sin(2 * Math.PI * freq * t) * amp * env;
      }
    });
  };

  const click = ({ durationMs, baseHz = 900, volume = 0.55 }) => {
    const duration = Math.max(20, Number(durationMs || 0));
    const sampleCount = Math.max(1, Math.floor((sampleRate * duration) / 1000));
    const amp = Math.max(0, Math.min(1, Number(volume)));
    const decay = Math.max(0.006, Math.min(0.06, duration / 1000));

    return buildWavPcm16({
      sampleRate,
      samples: sampleCount,
      sampleAt: (i, sr) => {
        const t = i / sr;
        const env = Math.exp(-t / decay);
        const n = (Math.random() * 2 - 1) * 0.35;
        const s = Math.sin(2 * Math.PI * Number(baseHz || 900) * t);
        return (s * 0.55 + n) * amp * env;
      }
    });
  };

  const roll = ({ durationMs = 520, volume = 0.55 }) => {
    const duration = Math.max(160, Number(durationMs || 0));
    const sampleCount = Math.max(1, Math.floor((sampleRate * duration) / 1000));
    const amp = Math.max(0, Math.min(1, Number(volume)));
    const totalT = duration / 1000;
    let lp = 0;

    return buildWavPcm16({
      sampleRate,
      samples: sampleCount,
      sampleAt: (i, sr) => {
        const t = i / sr;
        const progress = Math.min(1, t / totalT);
        const env = (1 - progress) * (1 - progress) * 0.95 + 0.05;
        const n = Math.random() * 2 - 1;
        lp = lp * 0.86 + n * 0.14;
        const hit = (i % Math.floor(sr * 0.04) === 0) ? (Math.random() * 2 - 1) * 0.5 : 0;
        return (lp * 0.85 + hit) * amp * env;
      }
    });
  };

  if (k === "roll") return roll({});
  if (k === "open") return click({ durationMs: 130, baseHz: 1200, volume: 0.6 });
  if (k === "ok") return click({ durationMs: 80, baseHz: 700, volume: 0.5 });
  if (k === "call") return tone({ frequencyHz: 360, durationMs: 110, volume: 0.32 });
  if (k === "win") return tone({ frequencyHz: 784, durationMs: 210, volume: 0.3 });
  if (k === "lose") return tone({ frequencyHz: 196, durationMs: 260, volume: 0.3 });
  return tone({ frequencyHz: 440, durationMs: 90, volume: 0.25 });
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

function buildWsHint(wsUrl, lastWsError = "") {
  const url = String(wsUrl || "").trim();
  const err = String(lastWsError || "");
  if (!url) {
    return "请先填写服务器地址";
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

function isDevtoolsPlatform() {
  try {
    const info = wx.getSystemInfoSync();
    return info && info.platform === "devtools";
  } catch (error) {
    return false;
  }
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
    selfScoreText: "28000",
    joinRoomId: "",
    createDirection: "cw",
    createWildcardOneEnabled: true,
    createDicePerPlayer: "5",
    createMinOpeningCount: "5",
    createTestMode: false,
    devtoolsMode: false,
    roomId: "",
    playerId: "",
    resumeToken: "",
    phase: "ready",
    phaseText: "准备阶段",
    round: 0,
    currentPlayerId: "",
    currentPlayerShort: "-",
    lastCallText: "-",
    lastCallObj: null,
    hasLastCall: false,
    openButtonText: "开牌",
    openHintText: "",
    primaryActionText: "开始",
    canPrimaryAction: false,
    startButtonText: "开始",
    canStart: false,
    roomConfig: null,
    playersRaw: [],
    playersDecorated: [],
    waitingPlayersRaw: [],
	    selfIsWaiting: false,
	    selfIsOwner: false,
	    selfHasDice: false,
	    selfHasCalled: false,
	    selfRollLocked: false,
    playerCount: 0,
    selectedTargetIds: [],
    ghostSeats: [],
    privateDice: [],
    privateDiceFaces: [],
    privateDiceText: "-",
    roomSelfDiceFaces: buildSelfDiceDisplayItems(),
    publicDiceText: "-",
    publicDiceList: [],
    openResultText: "",
    stagePrimaryText: "",
    stageSecondaryText: "",
    stageDiceText: "-",
    selfCallHint: "",
    stageCallMain: "",
    stageCallSub: "",
    stageCallTicker: [],
    stageCallCount: 0,
    stageCallPoint: 0,
    stageCallPointAsset: "",
    stageCallBy: "",
    stageCallBump: false,
    stageShowProgress: false,
    stageResultVisible: false,
    stageWinnerText: "",
    stageDeclaredText: "",
    stageActualText: "",
    settlementVisible: false,
    settlementSummaryText: "",
    settlementDeclaredText: "",
    settlementActualText: "",
    settlementRows: [],
    settlementContinueSec: 0,
	    lastCallKey: "",
	    callTimeline: [],
	    turnCountdownSec: 0,
	    myDiceVisible: false,
    myDicePeekVisible: false,
    myDiceRolling: false,
    myDiceJustRevealed: false,
    myDiceDisplayDice: buildSelfDiceFallback(5),
    myDiceDisplayFaces: buildDiceFaceItems(buildSelfDiceFallback(5)),
    myDiceSummaryText: "—",
    recording: false,
    voiceTipText: "按住语音键说话，松开发送",
    showDebug: false,
    callCount: "3",
    callPoint: "6",
    callCountOptions: buildCallCountOptionItems(3, 8, 1),
    callPointOptions: ["1", "2", "3", "4", "5", "6"],
    callPointOptionItems: buildCallPointOptionItems(["1", "2", "3", "4", "5", "6"]),
    maxCallCount: 1,
    callForcedOpen: false,
    callSelectorMode: "",
    callPanelExpanded: false,
    showJoinPanel: true,
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
    hideSocialUi: false,
    voiceItemsRaw: [],
    voiceItems: [],
	    playingVoiceId: "",
	    playingVoiceTip: "点击语音可播放",
	    sfxEnabled: true,
	    hapticEnabled: true,
    clockText: formatClock(Date.now()),
    featuredPlayerName: "",
    featuredPlayerAvatar: "",
    featuredPlayerInitial: "玩",
    callPanelVisible: false,
    canOpenAction: false,
    cornerPanelVisible: false,
    seatingVisible: false,
    seatingSelectedSeatIndex: 0,
    seatingSelectedText: "未选择",
    seatRows: [],
    legalAccepted: false,
    showLegalModal: false,
    logs: []
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
	    this.socketSeq = 0;
	    this.activeSocketId = 0;
	    this.devtoolsMode = isDevtoolsPlatform();
	    this.setData({ devtoolsMode: this.devtoolsMode });
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
    this.roomSelfRollingTimer = null;
	    this.stageBumpTimer = null;
	    this.turnCountdownTimer = null;
	    this.turnCountdownKey = "";
	    this.turnDeadlineTs = 0;
	    this.lastAutoRollRound = 0;
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
    this.clockTimer = setInterval(() => {
      this.setData({ clockText: formatClock(Date.now()) });
    }, 30000);
    this.setData({ clockText: formatClock(Date.now()) });

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
        joinRoomId: cached.roomId,
        playerId: cached.playerId,
        resumeToken: cached.resumeToken,
        showJoinPanel: true
      });
      this.pushLog("[session] loaded");
    }

    const cachedWsUrl = wx.getStorageSync(WS_URL_KEY);
    if (cachedWsUrl && typeof cachedWsUrl === "string") {
      this.setData({ wsUrl: cachedWsUrl.trim() });
      app.globalData.wsUrl = cachedWsUrl.trim();
    }

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
        showJoinPanel: true,
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
        showJoinPanel: true,
        joinRoomId: roomId
      });
      if (roomId) {
        this.queuePendingRoomAction({ kind: "join", roomId });
      }
    }

    if (legalAccepted) {
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
    const nickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
    const avatarUrl = String(wx.getStorageSync(AVATAR_URL_KEY) || "").trim();

    const nextNickname = nickname || this.data.nickname;
    const updates = {};
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
        avatar: avatarUrl || ""
      }, { silentLog: true });
    }

    this.startShakeListener();
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
        && !this.data.recording
        && !this.data.myDiceRolling;
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
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
    this.clearRoomSelfRollingTimer();

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
        avatar: this.data.avatarUrl || ""
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

  refreshWsHint(errorText = this.data.lastWsError) {
    this.setData({
      wsHintText: buildWsHint(this.data.wsUrl, errorText)
    });
  },

  handleBlockedAutoConnect() {
    if (this.devtoolsMode || !isLoopbackWsUrl(this.data.wsUrl)) {
      return false;
    }

    const hasPendingEntry = Boolean(this.pendingRoomAction);
    const errorText = "手机真机不可访问 127.0.0.1";

    this.setData({
      showJoinPanel: hasPendingEntry ? true : this.data.showJoinPanel,
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
    this.pendingRoomAction = action;
    const text = action.kind === "create"
      ? "连接成功后将自动创建房间"
      : `连接成功后将自动加入房间 ${action.roomId}`;
    this.setData({ pendingActionText: text });
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
        config: action.config
      });
      return true;
    }

    if (action.kind === "join" && action.roomId) {
      this.sendEvent("room:join", {
        roomId: action.roomId,
        nickname: this.data.nickname || "玩家",
        avatar: this.data.avatarUrl || ""
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

    this.socketTask = socketTask;
    this.activeSocketId = socketId;
    this.debugClientEvent("ws:connect_attempt", {
      socketId,
      wsUrl: this.data.wsUrl,
      roomId: this.data.roomId,
      playerId: this.data.playerId,
      pendingAction: this.pendingRoomAction ? this.pendingRoomAction.kind : "",
      manualClose: this.manualClose
    });

    socketTask.onOpen(() => {
      if (this.socketTask !== socketTask || this.activeSocketId !== socketId) {
        this.debugClientEvent("ws:open_stale", { socketId }, { ui: false });
        return;
      }

      this.setData({
        connected: true,
        connecting: false,
        networkStatusText: "网络良好",
        lastWsError: ""
      });
      this.refreshWsHint("");
      this.pushLog("[ws] connected");
      this.debugClientEvent("ws:open", {
        socketId,
        roomId: this.data.roomId,
        playerId: this.data.playerId,
        pendingAction: this.pendingRoomAction ? this.pendingRoomAction.kind : ""
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

      this.setData({
        connected: false,
        connecting: false,
        networkStatusText: "网络断开",
        lastWsError: reason ? `close(${code}):${reason}` : `close(${code})`
      });
      this.refreshWsHint(reason ? `close(${code}):${reason}` : `close(${code})`);
      this.pushLog(`[ws] closed code=${code}`);
      this.debugClientEvent("ws:close", {
        socketId,
        code,
        reason,
        roomId: this.data.roomId,
        playerId: this.data.playerId,
        manualClose: this.manualClose,
        skipAutoReconnectOnce: this.skipAutoReconnectOnce
      });

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

      const errMsg = err && err.errMsg ? err.errMsg : "connect error";
      this.socketTask = null;
      this.setData({
        connected: false,
        connecting: false,
        networkStatusText: "网络异常",
        lastWsError: errMsg
      });
      this.refreshWsHint(errMsg);
      this.pushLog(`[ws] error ${errMsg}`);
      this.debugClientEvent("ws:error", {
        socketId,
        errMsg,
        roomId: this.data.roomId,
        playerId: this.data.playerId,
        manualClose: this.manualClose,
        skipAutoReconnectOnce: this.skipAutoReconnectOnce
      });
      wx.showToast({ title: "连接失败，请看错误", icon: "none" });

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
      config
    });
  },

  joinRoom() {
    if (!this.data.joinRoomId) {
      wx.showToast({ title: "请输入房间号", icon: "none" });
      return;
    }

    if (!this.data.connected) {
      this.queuePendingRoomAction({
        kind: "join",
        roomId: this.data.joinRoomId
      });
      this.debugClientEvent("room:join_queued", {
        roomId: this.data.joinRoomId,
        playerId: this.data.playerId
      });
      this.connectSocket();
      wx.showToast({ title: "连接中，成功后自动加入", icon: "none" });
      return;
    }

    this.clearPendingRoomAction();
    this.debugClientEvent("room:join_send", {
      roomId: this.data.joinRoomId,
      playerId: this.data.playerId
    });
    this.sendEvent("room:join", {
      roomId: this.data.joinRoomId,
      nickname: this.data.nickname || "玩家",
      avatar: this.data.avatarUrl || ""
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
    // Best-effort notify server, then teardown locally and return to lobby.
    this.debugClientEvent("room:leave", {
      roomId: this.data.roomId,
      playerId: this.data.playerId,
      socketId: this.activeSocketId
    });
    if (this.socketTask && this.data.connected) {
      try {
        this.socketTask.send({
          data: JSON.stringify({
            event: "room:leave",
            payload: {},
            actionId: buildActionId()
          }),
          success: () => {},
          fail: () => {}
        });
      } catch (error) {
        // ignore
      }
    }

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
      this.socketTask = null;
    }

    this.clearSession();
    this.resetRoomView();
    wx.reLaunch({ url: "/pages/lobby/lobby" });
  },

  startGame() {
    this.haptic("light");
    this.playSfx("call");
    this.sendEvent("game:start", {});
  },

  rollDice() {
    this.haptic("light");
    this.playSfx("roll");
    this.showMyDiceDrawerRolling();
    this.sendEvent("dice:roll", {});
  },

  lockDice() {
    this.haptic("light");
    this.playSfx("ok");
    this.sendEvent("dice:lock", {});
  },

  finishRolling() {
    this.haptic("light");
    this.playSfx("call");
    this.sendEvent("rolling:finish", {});
  },

  clearRoomSelfRollingTimer() {
    if (this.roomSelfRollingTimer) {
      clearInterval(this.roomSelfRollingTimer);
      this.roomSelfRollingTimer = null;
    }
  },

  startRoomSelfRolling(expected) {
    const size = Math.max(1, Number(expected) || 5);
    const applyRollingFrame = () => {
      const rollingDice = buildRandomDiceValues(size);
      const rollingFaces = buildDiceFaceItems(rollingDice);
      this.setData({
        roomSelfDiceFaces: rollingFaces,
        myDiceDisplayDice: rollingDice,
        myDiceDisplayFaces: rollingFaces
      });
    };

    this.clearRoomSelfRollingTimer();
    applyRollingFrame();
    this.roomSelfRollingTimer = setInterval(applyRollingFrame, 120);
  },

  showMyDiceDrawerRolling() {
    const expected = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
      ? this.data.roomConfig.dicePerPlayer
      : 5;

    if (this.myDiceRevealTimer) {
      clearTimeout(this.myDiceRevealTimer);
      this.myDiceRevealTimer = null;
    }
    if (this.myDiceAutoPeekTimer) {
      clearTimeout(this.myDiceAutoPeekTimer);
      this.myDiceAutoPeekTimer = null;
    }

    const display = buildRandomDiceValues(expected);
    const rollingFaces = buildDiceFaceItems(display);

    this.setData({
      myDiceVisible: true,
      myDicePeekVisible: false,
      myDiceRolling: true,
      myDiceJustRevealed: false,
      myDiceDisplayDice: display,
      myDiceDisplayFaces: rollingFaces,
      roomSelfDiceFaces: rollingFaces,
      myDiceSummaryText: "摇骰中…"
    });
    this.startRoomSelfRolling(expected);

    this.myDiceAutoPeekTimer = setTimeout(() => {
      if (!this.data.myDiceRolling) {
        this.myDiceAutoPeekTimer = null;
        return;
      }
      this.clearRoomSelfRollingTimer();
      this.setData({
        myDiceRolling: false,
        myDiceJustRevealed: false,
        myDiceSummaryText: "等待摇骰结果…"
      });
      this.myDiceAutoPeekTimer = null;
    }, 2600);
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
    const summary = privateDice.length === expected ? this.buildMyDiceSummary(privateDice, this.data.roomConfig) : "等待摇骰";

    this.setData({
      myDiceVisible: true,
      myDicePeekVisible: false,
      myDiceRolling: false,
      myDiceJustRevealed: false,
      myDiceDisplayDice: display,
      myDiceDisplayFaces: buildDiceFaceItems(display),
      privateDiceFaces: buildDiceFaceItems(display),
      roomSelfDiceFaces: buildDiceFaceItems(display),
      myDiceSummaryText: summary
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
      myDiceJustRevealed: false
    });
  },

  buildMyDiceSummary(dice, roomConfig) {
    const nums = Array.isArray(dice) ? dice : [];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    nums.forEach((n) => {
      if (Number.isInteger(n) && n >= 1 && n <= 6) counts[n] += 1;
    });

    const brief = [1, 2, 3, 4, 5, 6]
      .map((p) => (counts[p] ? `${p}×${counts[p]}` : ""))
      .filter(Boolean)
      .join("  ");

    const wildcard = roomConfig && roomConfig.wildcardOneEnabled ? "通配1：开" : "通配1：关";
    return `${brief || "—"}  ·  ${wildcard}`;
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

    this.startSettlementCountdown(2);
    this.setData({
      settlementVisible: true,
      settlementSummaryText: model.summaryText,
      settlementDeclaredText: model.declaredText,
      settlementActualText: model.actualText,
      settlementRows: model.rows
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
      settlementRows: [],
      settlementContinueSec: 0
    });
  },

  restartRound() {
    this.haptic("light");
    const expected = this.data.roomConfig && typeof this.data.roomConfig.dicePerPlayer === "number"
      ? this.data.roomConfig.dicePerPlayer
      : 5;

    this.setData({
      publicDiceText: "-",
      publicDiceList: [],
      openResultText: "",
      stageResultVisible: false,
      stageWinnerText: "",
      stageDeclaredText: "",
      stageActualText: "",
      settlementVisible: false,
      settlementSummaryText: "",
      settlementDeclaredText: "",
      settlementActualText: "",
      settlementRows: [],
      settlementContinueSec: 0,
      privateDice: [],
      privateDiceFaces: [],
      privateDiceText: "-",
      roomSelfDiceFaces: buildSelfDiceDisplayItems(),
      selfHasDice: false,
      selfHasCalled: false,
      myDiceVisible: false,
      myDicePeekVisible: false,
      myDiceRolling: false,
      myDiceJustRevealed: false,
      myDiceDisplayDice: buildSelfDiceFallback(expected),
      myDiceDisplayFaces: buildDiceFaceItems(buildSelfDiceFallback(expected)),
      myDiceSummaryText: "—",
      callTimeline: [],
      lastCallKey: "",
      stageCallTicker: []
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

    this.playSfx("call");
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
    this.playSfx("open");
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

  toggleCornerPanel() {
    this.setData({
      cornerPanelVisible: !this.data.cornerPanelVisible
    });
  },

  closeCornerPanel() {
    if (!this.data.cornerPanelVisible) {
      return;
    }
    this.setData({
      cornerPanelVisible: false
    });
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
    const items = [];
    const actions = [];

    const next = this.data.showDebug ? "隐藏调试日志" : "显示调试日志";
    items.push(next);
    actions.push(() => this.setData({ showDebug: !this.data.showDebug }));

    items.push("打开调试页");
    actions.push(() => wx.navigateTo({ url: "/pages/index/index" }));

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

    const actionId = buildActionId();
    this.actionEventMap[actionId] = event;

    this.socketTask.send({
      data: JSON.stringify({
        event,
        payload,
        actionId
      }),
      success: () => {
        if (!options.silentLog) {
          this.pushLog(`-> ${event}`);
        }
      },
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
      this.pushLog("<- invalid packet");
      return;
    }

    const { event, payload } = packet;

    switch (event) {
      case "room:state": {
        const roomId = payload.roomId || this.data.roomId;
        const playersRaw = payload.players || [];
        const waitingPlayersRaw = payload.waitingPlayers || [];
        const roomConfig = payload.config || null;
        const playerCount = Array.isArray(playersRaw) ? playersRaw.length : 0;
        const validTargets = (this.data.selectedTargetIds || []).filter((id) => {
          return playersRaw.some((player) => player.id === id && player.id !== this.data.playerId);
        });
        const roomDirection = roomConfig && (roomConfig.direction === "ccw" ? "ccw" : "cw");
        const playersDecorated = decoratePlayers(playersRaw, this.data.playerId, validTargets, payload.lastCall, roomDirection);
        const ghostSeats = buildGhostSeats(playersDecorated, playersRaw.length);
        const currentPlayer = playersRaw.find((player) => player.id === payload.currentPlayerId);
        const self = playersRaw.find((player) => player.id === this.data.playerId);
        const selfDecorated = playersDecorated.find((player) => player.isSelf);
        const featuredPlayer = currentPlayer || self || playersRaw[0] || null;
        const featuredPlayerName = featuredPlayer
          ? (safeDecodeComponent(featuredPlayer.nickname).trim() || "玩家").slice(0, 6)
          : "";
        const featuredSeatIndex = Number(featuredPlayer && featuredPlayer.seatIndex);
        const featuredAvatarFallbackIndex = Number.isInteger(featuredSeatIndex) && featuredSeatIndex > 0
          ? (featuredSeatIndex - 1) % FIGMA_DEFAULT_AVATARS.length
          : 0;
        const featuredPlayerAvatar = featuredPlayer
          ? String(featuredPlayer.avatar || FIGMA_DEFAULT_AVATARS[featuredAvatarFallbackIndex] || "")
          : "";
        const featuredPlayerInitial = featuredPlayerName ? featuredPlayerName.slice(0, 1) : "玩";
        const selfIsOwner = Boolean(self && self.isOwner);
        const selfHasCalled = Boolean(self && self.currentCall);
        const selfRollLocked = Boolean(self && self.rollLocked);
        const selfAvatarUrl = (self && self.avatar) ? self.avatar : (this.data.avatarUrl || "");
        const selfScoreText = selfDecorated
          ? String(selfDecorated.scoreText || "")
          : resolvePlayerScoreText(self, 7, true);
        const selfIsWaiting = waitingPlayersRaw.some((player) => player.id === this.data.playerId)
          && !playersRaw.some((player) => player.id === this.data.playerId);
        const selfCallHint = self && self.currentCall ? `上一手：${self.currentCall.count}个${self.currentCall.point}` : "";
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
        const turnKey = `${incomingRound}:${phase}:${payload.currentPlayerId || "-"}:${lastCallObj ? lastCallObj.ts : 0}`;

        if (phase === "calling") {
          this.resetTurnCountdown(turnKey);
        } else {
          this.clearTurnCountdown();
        }

        let callTimeline = Array.isArray(this.data.callTimeline) ? this.data.callTimeline : [];
        let lastCallKey = String(this.data.lastCallKey || "");
        let stageCallBump = false;
        const roundChanged = incomingRound !== this.data.round;
        if (roundChanged) {
          callTimeline = [];
          lastCallKey = "";
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
            stageCallBump = true;
          }
        }

        const stageCallTicker = callTimeline.slice(0, 3);
        let openButtonText = "开牌";
        let openHintText = "";
        if (phase === "opening") {
          openButtonText = "开牌中";
          openHintText = "处理中";
        } else if (phase === "ready") {
          openButtonText = "开牌";
          openHintText = "未开局";
        } else if (phase === "rolling") {
          openButtonText = "开牌";
          openHintText = "摇骰中";
        } else if (phase === "ended") {
          openButtonText = "开牌";
          openHintText = "已结算";
        } else if (phase === "calling") {
          if (!lastCallObj) {
            openButtonText = "开牌";
            openHintText = "需上一手";
          } else if (payload.currentPlayerId && payload.currentPlayerId !== this.data.playerId) {
            openButtonText = "开牌";
            openHintText = "等轮到你";
          } else {
            openButtonText = "开牌";
            openHintText = "可开";
          }
        }

        const canStart = Boolean(selfIsOwner && phase === "ready" && playerCount >= 2);
        const startButtonText = selfIsOwner
          ? (playerCount >= 2 ? "开始" : "开始(需2人)")
          : "等待房主";

        const isMyTurn = payload.currentPlayerId === this.data.playerId;
        const stageShowProgress = phase === "opening";
        let stagePrimaryText = `第${payload.round || 0}局 · ${phaseToText(phase)}`;
        let stageSecondaryText = "";

        if (selfIsWaiting) {
          stageSecondaryText = "等待下一局加入对局";
        } else if (phase === "ready") {
          stageSecondaryText = selfIsOwner
            ? (playerCount >= 2 ? "可排位后开始" : "等待更多玩家加入")
            : "等待房主开始";
        } else if (phase === "rolling") {
          const lockedCount = playersRaw.filter((p) => p.rollLocked).length;
          const totalCount = playersRaw.length;
          if (!selfRollLocked) {
            stageSecondaryText = `摇骰中：${lockedCount}/${totalCount}已OK · 请摇一摇并点OK`;
          } else {
            stageSecondaryText = `已OK，等待其他玩家确认（${lockedCount}/${totalCount}）`;
          }
        } else if (phase === "calling") {
          stageSecondaryText = isMyTurn ? "轮到你叫骰或质疑" : `等待 ${currentPlayer ? String(currentPlayer.nickname || "").slice(0, 2) : "玩家"} 操作`;
        } else if (phase === "opening") {
          stageSecondaryText = "正在开牌，请稍候";
        } else if (phase === "ended") {
          const isNextRoundStarter = payload.currentPlayerId === this.data.playerId;
          if ((waitingPlayersRaw || []).length > 0) {
            const countText = `有${waitingPlayersRaw.length}位等待者`;
            if (isNextRoundStarter) {
              stageSecondaryText = `${countText}，可先安排入座再开始`;
            } else if (selfIsOwner) {
              stageSecondaryText = `${countText}，等待输家开始`;
            } else {
              stageSecondaryText = `${countText}旁观中`;
            }
          } else {
            stageSecondaryText = isNextRoundStarter ? "由你开始下一局" : "等待输家开始";
          }
        }

        let stageCallMain = "";
        let stageCallSub = "";
        let stageCallCount = 0;
        let stageCallPoint = 0;
        let stageCallBy = "";
        if (phase === "ended") {
          stageCallMain = "全局骰面";
          stageCallSub = "本局结果已公开";
        } else if (phase === "opening") {
          stageCallMain = lastCallObj ? `${lastCallObj.count}个${lastCallObj.point}` : "开牌中";
          stageCallSub = lastCallObj ? `当前叫牌 · ${lastByLabel}` : "正在开牌，请稍候";
        } else if (phase === "rolling") {
          stageCallMain = "请摇骰";
          stageCallSub = `每人${dicePerPlayer}颗 · 起叫≥${roomConfig && roomConfig.minOpeningCount ? roomConfig.minOpeningCount : 1}`;
        } else if (phase === "calling") {
          stageCallMain = lastCallObj
            ? `${lastCallObj.count}个${lastCallObj.point}`
            : "等待起叫";
          stageCallSub = lastCallObj
            ? `上家：${lastByLabel}`
            : `已摇骰完成（每人${dicePerPlayer}颗）· 起叫≥${roomConfig && roomConfig.minOpeningCount ? roomConfig.minOpeningCount : 1}`;
        } else {
          stageCallMain = "准备阶段";
          stageCallSub = selfIsOwner ? "可排位后开始" : "等待房主开始";
        }

        if (lastCallObj) {
          stageCallCount = Number(lastCallObj.count) || 0;
          stageCallPoint = Number(lastCallObj.point) || 0;
          stageCallBy = lastByLabel;
        } else {
          stageCallCount = 0;
          stageCallPoint = 0;
          stageCallBy = "";
        }

        const stageDiceText = phase === "ended"
          ? (this.data.publicDiceText || "-")
          : "-";

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

        const stageResultVisible = Boolean(this.data.stageResultVisible) && (phase === "opening" || phase === "ended");
        const settlementVisible = Boolean(this.data.settlementVisible) && phase === "ended";
        if (!settlementVisible && this.data.settlementVisible) {
          this.clearSettlementCountdown();
          this.latestOpenResult = null;
          this.latestRoundSummary = null;
        }

        const hasDice = Array.isArray(this.data.privateDice) && this.data.privateDice.length === dicePerPlayer;
        const myDicePeekVisible = !selfIsWaiting && phase !== "ended" && !this.data.myDiceVisible && hasDice;
        const roomSelfDiceFaces = this.data.myDiceRolling
          ? this.data.roomSelfDiceFaces
          : (hasDice ? buildDiceFaceItems(this.data.privateDice) : buildSelfDiceDisplayItems());

        const currentPlayerNameShort = currentPlayer
          ? ((safeDecodeComponent(currentPlayer.nickname).trim() || "").slice(0, 2) || String(currentPlayer.id || "").slice(0, 2))
          : "";
        const currentPlayerLabel = currentPlayer
          ? `${currentPlayer.seatIndex || "-"}号${currentPlayerNameShort}`
          : "-";

        let primaryActionText = "开始";
        let canPrimaryAction = false;
        if (selfIsWaiting) {
          primaryActionText = "旁观中";
          canPrimaryAction = false;
        } else if (phase === "ready") {
          primaryActionText = startButtonText;
          canPrimaryAction = canStart;
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
        const seatRows = buildSeatRows(playersRaw, 7, seatingSelectedSeatIndex);
        const selectedRow = seatingSelectedSeatIndex ? seatRows.find((r) => r.seatIndex === seatingSelectedSeatIndex) : null;
        const seatingSelectedText = seatingSelectedSeatIndex
          ? (selectedRow && selectedRow.occupied
            ? `${seatingSelectedSeatIndex}号 ${String(selectedRow.label || "").split("（")[0]}`
            : `${seatingSelectedSeatIndex}号 空`)
          : "未选择";

        this.setData({
          roomId,
          joinRoomId: roomId,
          phase: payload.phase || "ready",
          phaseText: phaseToText(payload.phase),
          round: payload.round || 0,
          currentPlayerId: payload.currentPlayerId || "",
          currentPlayerShort: currentPlayerLabel,
          lastCallText: payload.lastCall ? `${lastByLabel} ${payload.lastCall.count}个${payload.lastCall.point}` : "-",
          lastCallObj,
          hasLastCall: Boolean(lastCallObj),
          openButtonText,
          openHintText,
          primaryActionText,
          canPrimaryAction,
          canStart,
          startButtonText,
          roomConfig,
          playersRaw,
          playersDecorated,
          ghostSeats,
          waitingPlayersRaw,
          selfIsWaiting,
          selfIsOwner,
          selfHasCalled,
          selfHasDice: hasDice,
          selfRollLocked,
          selfAvatarUrl,
          selfScoreText,
          playerCount,
          seatRows,
          seatingSelectedSeatIndex,
          seatingSelectedText,
          voiceItems: this.decorateVoiceItems(this.data.voiceItemsRaw, playersRaw),
          chatItems: this.decorateChatItems(this.data.chatItemsRaw, playersRaw, this.data.playerId),
          selectedTargetIds: validTargets,
          showJoinPanel: false,
          featuredPlayerName,
          featuredPlayerAvatar,
          featuredPlayerInitial,
          callCount: nextCallCount,
          callPoint: nextCallPoint,
          callCountOptions,
          maxCallCount,
          callForcedOpen,
          callSelectorMode: isMyCallingTurn ? (this.data.callSelectorMode || "count") : "",
          callPanelExpanded: isMyCallingTurn ? callPanelExpanded : false,
          callPanelVisible,
          canOpenAction,
          stagePrimaryText,
          stageSecondaryText,
          stageDiceText,
          selfCallHint,
          stageCallMain,
          stageCallSub,
          stageCallTicker,
          stageCallCount,
          stageCallPoint,
          stageCallPointAsset: getFigmaDieAsset(stageCallPoint),
          stageCallBy,
          stageCallBump: stageCallBump ? true : this.data.stageCallBump,
          stageShowProgress,
          stageResultVisible,
          settlementVisible,
          settlementSummaryText: settlementVisible ? this.data.settlementSummaryText : "",
          settlementDeclaredText: settlementVisible ? this.data.settlementDeclaredText : "",
          settlementActualText: settlementVisible ? this.data.settlementActualText : "",
          settlementRows: settlementVisible ? this.data.settlementRows : [],
          settlementContinueSec: settlementVisible ? this.data.settlementContinueSec : 0,
          privateDice: (selfIsWaiting || roundChanged) ? [] : this.data.privateDice,
          privateDiceText: (selfIsWaiting || roundChanged) ? "-" : this.data.privateDiceText,
          callTimeline,
          lastCallKey,
          turnCountdownSec: this.data.turnCountdownSec,
          roomSelfDiceFaces: (selfIsWaiting || roundChanged) ? buildSelfDiceDisplayItems() : roomSelfDiceFaces,
          myDiceVisible: (selfIsWaiting || phase === "ended" || roundChanged) ? false : this.data.myDiceVisible,
          myDicePeekVisible: selfIsWaiting ? false : myDicePeekVisible
        });

        if (stageCallBump) {
          if (this.stageBumpTimer) {
            clearTimeout(this.stageBumpTimer);
            this.stageBumpTimer = null;
          }
          this.setData({ stageCallBump: true });
          this.stageBumpTimer = setTimeout(() => {
            this.setData({ stageCallBump: false });
            this.stageBumpTimer = null;
          }, 320);
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

        if (payload.roomId || payload.playerId || payload.resumeToken) {
          const nextData = {
            roomId: payload.roomId || this.data.roomId,
            playerId: payload.playerId || this.data.playerId,
            resumeToken: payload.resumeToken || this.data.resumeToken,
            joinRoomId: payload.roomId || this.data.joinRoomId
          };

          this.setData({
            ...nextData,
            showJoinPanel: !nextData.roomId
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
        const summary = finalDice.length === expected ? this.buildMyDiceSummary(finalDice, this.data.roomConfig) : "—";
        const peek = finalDice.length === expected ? finalDice.join("·") : "-";

        if (this.myDiceRevealTimer) {
          clearTimeout(this.myDiceRevealTimer);
          this.myDiceRevealTimer = null;
        }
        if (this.myDiceAutoPeekTimer) {
          clearTimeout(this.myDiceAutoPeekTimer);
          this.myDiceAutoPeekTimer = null;
        }
        this.clearRoomSelfRollingTimer();

        this.setData({
          privateDice: finalDice,
          privateDiceFaces: buildDiceFaceItems(finalDice),
          privateDiceText: peek,
          selfHasDice: finalDice.length === expected,
          myDiceVisible: !this.data.selfIsWaiting && this.data.phase !== "ended",
          myDicePeekVisible: false,
          myDiceRolling: false,
          myDiceJustRevealed: true,
          myDiceDisplayDice: finalDice.length === expected
            ? finalDice
            : buildSelfDiceFallback(expected),
          myDiceDisplayFaces: buildDiceFaceItems(finalDice.length === expected
            ? finalDice
            : buildSelfDiceFallback(expected)),
          roomSelfDiceFaces: buildDiceFaceItems(finalDice.length === expected
            ? finalDice
            : buildSelfDiceFallback(expected)),
          myDiceSummaryText: summary
        });

        this.myDiceRevealTimer = setTimeout(() => {
          this.setData({ myDiceJustRevealed: false });
          this.myDiceRevealTimer = null;
        }, 1200);

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

          const openerId = String(payload.openerId || "");
          const targetId = String(first.targetId || "");
          const winnerId = String(first.winnerId || "");
          const loserId = winnerId && targetId
            ? (winnerId === targetId ? openerId : targetId)
            : "";
          const selfId = String(this.data.playerId || "");
          if (winnerId && selfId === winnerId) {
            this.playSfx("win");
          } else if (loserId && selfId === loserId) {
            this.playSfx("lose");
          }

          this.setData({
            openResultText: `胜者：${winnerShort}（${first.declared.count}个${first.declared.point} / 实${first.actual}）`,
            stageResultVisible: true,
            stageWinnerText: `胜者：${winnerShort}`,
            stageDeclaredText: `叫：${first.declared.count}个${first.declared.point}`,
            stageActualText: `实：${first.actual}`
          });
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

        this.setData({
          publicDiceText: line || "-",
          stageDiceText: line || "-",
          publicDiceList: players.map((p) => {
            const info = playerMap.get(p.playerId);
            const seatIndex = info ? info.seatIndex : 0;
            const nameFull = info ? (safeDecodeComponent(info.nickname).trim() || "玩家") : String(p.playerId || "").slice(0, 8);
            const dice = Array.isArray(p.dice) ? p.dice.slice(0, 5).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 6) : [];
            const diceIcons = dice.map((n) => diceChars[n] || "•").join(" ");
            return {
              seatIndex,
              label: `${seatIndex ? `${seatIndex}号` : ""}${String(nameFull).slice(0, 4)}`,
              diceIcons,
              diceRaw: dice.join(" ")
            };
          }).sort((a, b) => (a.seatIndex || 99) - (b.seatIndex || 99))
        });
        this.showSettlementPanel(null, payload);
        break;
      }
      case "voice:uploaded": {
        const who = String(payload.playerId || "").slice(0, 8);
        const sec = Math.max(1, Math.round(Number(payload.durationMs || 0) / 1000));
        this.pushLog(`[voice] ${who} 上传语音 ${sec}s`);
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
        wx.showToast({ title: payload.message || "系统错误", icon: "none" });
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
      this.sfxPaths = {};
      return;
    }

    const base = wx.env.USER_DATA_PATH;
    const keys = ["roll", "ok", "call", "open", "win", "lose"];

    const nextPaths = {};
    for (const key of keys) {
      const path = `${base}/dice_sfx_${key}.wav`;
      try {
        await accessFile(path);
      } catch (error) {
        try {
          const buffer = buildWavSfx(key);
          await writeArrayBufferToFile(path, buffer);
        } catch (error) {
          // ignore sfx write failures (still playable without)
        }
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
    this.clearRoomSelfRollingTimer();

    if (this.myDiceRevealTimer) {
      clearTimeout(this.myDiceRevealTimer);
      this.myDiceRevealTimer = null;
    }
    if (this.myDiceAutoPeekTimer) {
      clearTimeout(this.myDiceAutoPeekTimer);
      this.myDiceAutoPeekTimer = null;
    }
    if (this.stageBumpTimer) {
      clearTimeout(this.stageBumpTimer);
      this.stageBumpTimer = null;
    }
    this.clearSettlementCountdown();
    this.latestOpenResult = null;
    this.latestRoundSummary = null;

    this.pendingVoiceFileId = "";
    this.clearPendingRoomAction();

    this.setData({
      roomId: "",
      playerId: "",
      resumeToken: "",
      phase: "ready",
      phaseText: phaseToText("ready"),
      round: 0,
      currentPlayerId: "",
      currentPlayerShort: "-",
      lastCallText: "-",
      lastCallObj: null,
      hasLastCall: false,
      openButtonText: "开牌",
      openHintText: "",
      primaryActionText: "开始",
      canPrimaryAction: false,
      startButtonText: "开始",
      canStart: false,
      roomConfig: null,
      playersRaw: [],
      playersDecorated: [],
      ghostSeats: [],
      waitingPlayersRaw: [],
      selfIsWaiting: false,
      selfIsOwner: false,
      selfHasDice: false,
      selfHasCalled: false,
      playerCount: 0,
      selectedTargetIds: [],
      privateDice: [],
      privateDiceFaces: [],
      privateDiceText: "-",
      publicDiceText: "-",
      publicDiceList: [],
      openResultText: "",
      stagePrimaryText: "",
      stageSecondaryText: "",
      stageDiceText: "-",
      selfCallHint: "",
      stageCallMain: "",
      stageCallSub: "",
      stageCallTicker: [],
      stageCallCount: 0,
      stageCallPoint: 0,
      stageCallPointAsset: "",
      stageCallBy: "",
      stageCallBump: false,
      stageShowProgress: false,
      stageResultVisible: false,
      stageWinnerText: "",
      stageDeclaredText: "",
      stageActualText: "",
      settlementVisible: false,
      settlementSummaryText: "",
      settlementDeclaredText: "",
      settlementActualText: "",
      settlementRows: [],
      settlementContinueSec: 0,
      lastCallKey: "",
      callTimeline: [],
      myDiceVisible: false,
      myDicePeekVisible: false,
      myDiceRolling: false,
      myDiceJustRevealed: false,
      myDiceDisplayDice: buildSelfDiceFallback(5),
      myDiceDisplayFaces: buildDiceFaceItems(buildSelfDiceFallback(5)),
      roomSelfDiceFaces: buildSelfDiceDisplayItems(),
      myDiceSummaryText: "—",
      showJoinPanel: true,
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
      cornerPanelVisible: false,
      seatingVisible: false,
      seatingSelectedSeatIndex: 0,
      seatingSelectedText: "未选择",
      seatRows: [],
      pendingActionText: ""
    });
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
    this.clearRoomSelfRollingTimer();

    if (this.myDiceRevealTimer) {
      clearTimeout(this.myDiceRevealTimer);
      this.myDiceRevealTimer = null;
    }
    if (this.myDiceAutoPeekTimer) {
      clearTimeout(this.myDiceAutoPeekTimer);
      this.myDiceAutoPeekTimer = null;
    }
    if (this.stageBumpTimer) {
      clearTimeout(this.stageBumpTimer);
      this.stageBumpTimer = null;
    }
    this.clearSettlementCountdown();
    this.latestOpenResult = null;
    this.latestRoundSummary = null;

    this.setData({
      roomId: "",
      playerId: "",
      resumeToken: "",
      joinRoomId: "",
      showJoinPanel: true,
      openButtonText: "开牌",
      openHintText: "",
      startButtonText: "开始",
      canStart: false,
      playerCount: 0,
      selfAvatarUrl: this.data.avatarUrl || "",
      stagePrimaryText: "",
      stageSecondaryText: "",
      stageDiceText: "-",
      selfCallHint: "",
      stageCallMain: "",
      stageCallSub: "",
      stageCallTicker: [],
      publicDiceList: [],
      stageCallCount: 0,
      stageCallPoint: 0,
      stageCallBy: "",
      stageCallBump: false,
      stageShowProgress: false,
      stageResultVisible: false,
      stageWinnerText: "",
      stageDeclaredText: "",
      stageActualText: "",
      settlementVisible: false,
      settlementSummaryText: "",
      settlementDeclaredText: "",
      settlementActualText: "",
      settlementRows: [],
      settlementContinueSec: 0,
      callCount: "3",
      callPoint: "6",
      callCountOptions: buildCallCountOptionItems(3, 8, 1),
      callForcedOpen: false,
      callSelectorMode: "",
      callPanelExpanded: false,
      callPanelVisible: false,
      canOpenAction: false,
      cornerPanelVisible: false,
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
      myDiceJustRevealed: false,
      myDiceDisplayDice: buildSelfDiceFallback(5),
      myDiceDisplayFaces: buildDiceFaceItems(buildSelfDiceFallback(5)),
      roomSelfDiceFaces: buildSelfDiceDisplayItems(),
      myDiceSummaryText: "—",
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
      if (this.handleBlockedAutoConnect()) {
        return;
      }
      this.connectSocket();
    }
  },

  declineLegal() {
    wx.showToast({ title: "同意后方可继续使用", icon: "none" });
  },

  pushLog(line) {
    const logs = [line, ...this.data.logs].slice(0, 10);
    this.setData({ logs });
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

    const showInUi = options && options.ui === true;
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

    if (!showInUi) {
      return;
    }

    try {
      const text = `[debug] ${event}`;
      this.pushLog(text);
    } catch (error) {
      // ignore UI log failure
    }
  }
});
