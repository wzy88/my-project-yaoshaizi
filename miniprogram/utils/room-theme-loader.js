const {
  ROOM_THEME_MANIFEST_CACHE_KEY,
  ROOM_THEME_FILE_CACHE_KEY
} = require("./constants");
const { requestBackend } = require("./backend-request");
const {
  DEFAULT_ROOM_THEME_ID,
  normalizeRoomThemeId,
  buildRoomThemeClass,
  getRoomThemeLabel
} = require("./room-themes");
const {
  getRoomThemeAssets,
  registerRuntimeRoomThemeAssets
} = require("./room-theme-assets");
const {
  getSelfDieAsset,
  registerRuntimeDiceThemeAssets
} = require("./dice-assets");

const MANIFEST_CACHE_LIMIT = 12;
const FILE_CACHE_LIMIT = 96;

function safeGetStorage(key) {
  try {
    return globalThis.wx && typeof globalThis.wx.getStorageSync === "function"
      ? globalThis.wx.getStorageSync(key)
      : null;
  } catch (error) {
    return null;
  }
}

function safeSetStorage(key, value) {
  try {
    if (globalThis.wx && typeof globalThis.wx.setStorageSync === "function") {
      globalThis.wx.setStorageSync(key, value);
    }
  } catch (error) {
    // Storage is best-effort for theme loading.
  }
}

function isRemoteAsset(src) {
  return /^https?:\/\//i.test(String(src || "").trim());
}

function normalizeDiceAssets(rawDice) {
  const source = rawDice && typeof rawDice === "object" ? rawDice : {};
  const dice = {};
  for (let point = 1; point <= 6; point += 1) {
    const src = String(source[point] || source[String(point)] || "").trim();
    if (src) {
      dice[String(point)] = src;
    }
  }
  return dice;
}

function buildLocalDiceAssets(themeId) {
  const dice = {};
  for (let point = 1; point <= 6; point += 1) {
    dice[String(point)] = getSelfDieAsset(point, themeId);
  }
  return dice;
}

function buildLocalRoomThemeManifest(themeId = DEFAULT_ROOM_THEME_ID) {
  const id = normalizeRoomThemeId(themeId);
  const assets = getRoomThemeAssets(id);
  const label = getRoomThemeLabel(id);

  return {
    id,
    version: "bundled",
    label,
    className: buildRoomThemeClass(id),
    delivery: "bundled",
    assets: {
      ...assets,
      dice: buildLocalDiceAssets(id)
    },
    criticalAssets: [
      assets.pageBackgroundSrc,
      assets.tableclothSrc,
      assets.cupSkinSrc,
      assets.primaryButtonSrc,
      assets.openButtonSrc,
      assets.primaryIconSrc
    ].filter(Boolean),
    tokens: {
      themeId: id
    },
    loading: {
      title: `正在布置「${label}」房间`,
      steps: ["同步主题配置", "加载桌面资源", "准备骰盅与按钮", "进入房间"]
    }
  };
}

function normalizeRoomThemeManifest(rawManifest, fallbackThemeId = DEFAULT_ROOM_THEME_ID) {
  const fallback = buildLocalRoomThemeManifest(fallbackThemeId);
  const source = rawManifest && typeof rawManifest === "object" ? rawManifest : {};
  const id = normalizeRoomThemeId(source.id || fallback.id);
  const local = buildLocalRoomThemeManifest(id);
  const rawAssets = source.assets && typeof source.assets === "object" ? source.assets : {};
  const dice = normalizeDiceAssets(rawAssets.dice);
  const assets = {
    ...local.assets,
    ...rawAssets,
    dice: Object.keys(dice).length > 0 ? { ...local.assets.dice, ...dice } : local.assets.dice
  };
  const label = String(source.label || local.label || getRoomThemeLabel(id));
  const loading = source.loading && typeof source.loading === "object" ? source.loading : {};
  const loadingSteps = Array.isArray(loading.steps)
    ? loading.steps.map((step) => String(step || "").trim()).filter(Boolean)
    : local.loading.steps;

  return {
    id,
    version: String(source.version || local.version || "bundled"),
    label,
    className: String(source.className || buildRoomThemeClass(id)),
    delivery: source.delivery === "remote" ? "remote" : "bundled",
    assets,
    criticalAssets: Array.isArray(source.criticalAssets)
      ? source.criticalAssets.map((src) => String(src || "").trim()).filter(Boolean)
      : local.criticalAssets,
    tokens: source.tokens && typeof source.tokens === "object"
      ? { ...source.tokens, themeId: id }
      : { themeId: id },
    loading: {
      title: String(loading.title || local.loading.title),
      steps: loadingSteps.length ? loadingSteps : local.loading.steps
    }
  };
}

function registerRoomThemeManifest(manifest) {
  const normalized = normalizeRoomThemeManifest(manifest);
  registerRuntimeRoomThemeAssets(normalized.id, normalized.assets);
  registerRuntimeDiceThemeAssets(normalized.id, normalized.assets.dice);
  cacheRoomThemeManifest(normalized);
  return normalized;
}

function readManifestCache() {
  const raw = safeGetStorage(ROOM_THEME_MANIFEST_CACHE_KEY);
  return raw && typeof raw === "object" ? raw : {};
}

function cacheRoomThemeManifest(manifest) {
  const normalized = normalizeRoomThemeManifest(manifest);
  const key = `${normalized.id}@${normalized.version}`;
  const cache = readManifestCache();
  const next = {
    [key]: {
      savedAt: Date.now(),
      manifest: normalized
    },
    ...cache
  };
  const trimmed = Object.entries(next).slice(0, MANIFEST_CACHE_LIMIT).reduce((acc, [entryKey, entry]) => {
    acc[entryKey] = entry;
    return acc;
  }, {});
  safeSetStorage(ROOM_THEME_MANIFEST_CACHE_KEY, trimmed);
}

function findCachedRoomThemeManifest(themeId, version = "") {
  const id = normalizeRoomThemeId(themeId);
  const cache = readManifestCache();
  const targetVersion = String(version || "").trim();
  const entries = Object.entries(cache)
    .map(([key, value]) => ({ key, value: value && typeof value === "object" ? value : {} }))
    .filter((entry) => entry.key.startsWith(`${id}@`))
    .sort((a, b) => Number(b.value.savedAt || 0) - Number(a.value.savedAt || 0));
  const hit = targetVersion
    ? entries.find((entry) => entry.key === `${id}@${targetVersion}`)
    : entries[0];
  return hit && hit.value.manifest ? normalizeRoomThemeManifest(hit.value.manifest, id) : null;
}

function readFileCache() {
  const raw = safeGetStorage(ROOM_THEME_FILE_CACHE_KEY);
  return raw && typeof raw === "object" ? raw : {};
}

function writeFileCache(cache) {
  const trimmed = Object.entries(cache)
    .sort((a, b) => Number(b[1] && b[1].savedAt || 0) - Number(a[1] && a[1].savedAt || 0))
    .slice(0, FILE_CACHE_LIMIT)
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  safeSetStorage(ROOM_THEME_FILE_CACHE_KEY, trimmed);
}

function downloadAsset(src, cacheKey) {
  const url = String(src || "").trim();
  if (!isRemoteAsset(url)) {
    return Promise.resolve(url);
  }

  const fileCache = readFileCache();
  const cached = fileCache[cacheKey];
  if (cached && cached.path) {
    return Promise.resolve(String(cached.path));
  }

  if (!globalThis.wx || typeof globalThis.wx.downloadFile !== "function") {
    return Promise.resolve(url);
  }

  return new Promise((resolve) => {
    globalThis.wx.downloadFile({
      url,
      success: (res) => {
        const statusCode = Number(res && res.statusCode) || 0;
        const tempFilePath = String(res && res.tempFilePath || "").trim();
        if (statusCode < 200 || statusCode >= 300 || !tempFilePath) {
          resolve(url);
          return;
        }

        const fs = globalThis.wx && typeof globalThis.wx.getFileSystemManager === "function"
          ? globalThis.wx.getFileSystemManager()
          : null;
        if (!fs || typeof fs.saveFile !== "function") {
          resolve(tempFilePath);
          return;
        }

        fs.saveFile({
          tempFilePath,
          success: (saveRes) => {
            const savedFilePath = String(saveRes && saveRes.savedFilePath || tempFilePath);
            fileCache[cacheKey] = {
              url,
              path: savedFilePath,
              savedAt: Date.now()
            };
            writeFileCache(fileCache);
            resolve(savedFilePath);
          },
          fail: () => resolve(tempFilePath)
        });
      },
      fail: () => resolve(url)
    });
  });
}

async function hydrateThemeAssets(manifest) {
  const normalized = normalizeRoomThemeManifest(manifest);
  const assets = { ...normalized.assets };
  const dice = { ...(assets.dice || {}) };
  const assetFields = [
    "menuIconSrc",
    "primaryIconSrc",
    "primaryButtonSrc",
    "openButtonSrc",
    "secondaryIconSrc",
    "pageBackgroundSrc",
    "bubbleSkinSrc",
    "cupSkinSrc",
    "selfCupTextureSrc",
    "tableclothSrc"
  ];

  await Promise.all(assetFields.map(async (field) => {
    const src = String(assets[field] || "");
    if (!src) return;
    assets[field] = await downloadAsset(src, `${normalized.id}@${normalized.version}:${field}`);
  }));

  await Promise.all(Object.keys(dice).map(async (point) => {
    const src = String(dice[point] || "");
    if (!src) return;
    dice[point] = await downloadAsset(src, `${normalized.id}@${normalized.version}:die-${point}`);
  }));

  return normalizeRoomThemeManifest({
    ...normalized,
    assets: {
      ...assets,
      dice
    }
  }, normalized.id);
}

async function fetchRoomThemeManifest(themeId, themeVersion = "") {
  const requestedThemeId = normalizeRoomThemeId(themeId);
  const requestedVersion = String(themeVersion || "").trim();
  const response = await requestBackend({
    path: "/api/room-theme-manifest",
    method: "POST",
    data: {
      themeId: requestedThemeId,
      themeVersion: requestedVersion === "bundled" ? "" : requestedVersion
    }
  });
  const data = response && response.data ? response.data : response;
  const manifest = normalizeRoomThemeManifest(data && data.manifest ? data.manifest : data, requestedThemeId);
  if (manifest.id !== requestedThemeId) {
    throw new Error(`room theme manifest mismatch: requested ${requestedThemeId}, got ${manifest.id}`);
  }
  return manifest;
}

async function loadRoomThemeManifest(themeId, options = {}) {
  const id = normalizeRoomThemeId(themeId);
  const serverManifest = options.serverManifest ? normalizeRoomThemeManifest(options.serverManifest, id) : null;
  const preferRemote = options.preferRemote !== false;
  const downloadAssets = options.downloadAssets !== false;

  if (serverManifest) {
    const hydrated = downloadAssets ? await hydrateThemeAssets(serverManifest) : serverManifest;
    return registerRoomThemeManifest(hydrated);
  }

  const cached = findCachedRoomThemeManifest(id, options.themeVersion);
  if (cached && !preferRemote) {
    return registerRoomThemeManifest(cached);
  }

  try {
    const remote = await fetchRoomThemeManifest(id, options.themeVersion);
    const hydrated = downloadAssets ? await hydrateThemeAssets(remote) : remote;
    return registerRoomThemeManifest(hydrated);
  } catch (error) {
    if (cached) {
      return registerRoomThemeManifest(cached);
    }
    return registerRoomThemeManifest(buildLocalRoomThemeManifest(id));
  }
}

module.exports = {
  buildLocalRoomThemeManifest,
  normalizeRoomThemeManifest,
  registerRoomThemeManifest,
  findCachedRoomThemeManifest,
  fetchRoomThemeManifest,
  loadRoomThemeManifest,
  hydrateThemeAssets,
  isRemoteAsset
};
