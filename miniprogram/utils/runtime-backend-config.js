const {
  WS_URL_KEY,
  CLOUD_ENV_ID_KEY,
  CLOUD_SERVICE_KEY,
  CLOUD_WS_PATH_KEY
} = require("./constants");
const {
  getDefaultContainerConfig,
  resolveContainerConfig,
  hasContainerService
} = require("./cloud-container");

// 固定运行时连接目标，预览/体验版/正式版都走这里注入的后端。
// Node 测试环境默认忽略该配置，避免本地单元测试被真实线上目标耦合。
const FIXED_RUNTIME_CONNECTION = Object.freeze({
  wsUrl: "",
  containerConfig: Object.freeze({
    envId: "test-5gz3z9msd3e7502f",
    service: "express-rw1k",
    wsPath: "/ws"
  })
});

function isNodeLikeRuntime() {
  return Boolean(
    typeof process !== "undefined" &&
    process &&
    process.versions &&
    process.versions.node
  );
}

function normalizeRuntimeConnection(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    wsUrl: String(source.wsUrl || "").trim(),
    containerConfig: resolveContainerConfig(source.containerConfig || {})
  };
}

function hasConnectableTarget(raw) {
  const connection = normalizeRuntimeConnection(raw);
  return Boolean(connection.wsUrl) || hasContainerService(connection.containerConfig);
}

function getFixedRuntimeConnection() {
  if (globalThis.__DICE_RUNTIME_CONNECTION_OVERRIDE__) {
    return normalizeRuntimeConnection(globalThis.__DICE_RUNTIME_CONNECTION_OVERRIDE__);
  }

  if (isNodeLikeRuntime() && globalThis.__DICE_USE_FIXED_RUNTIME_CONNECTION_IN_NODE__ !== true) {
    return normalizeRuntimeConnection({
      wsUrl: "",
      containerConfig: getDefaultContainerConfig()
    });
  }

  return normalizeRuntimeConnection(FIXED_RUNTIME_CONNECTION);
}

function hasFixedRuntimeConnection() {
  return hasConnectableTarget(getFixedRuntimeConnection());
}

function readLegacyRuntimeConnection() {
  const defaultContainerConfig = getDefaultContainerConfig();
  if (!globalThis.wx || typeof globalThis.wx.getStorageSync !== "function") {
    return {
      wsUrl: "",
      containerConfig: defaultContainerConfig
    };
  }

  return normalizeRuntimeConnection({
    wsUrl: globalThis.wx.getStorageSync(WS_URL_KEY),
    containerConfig: {
      envId: globalThis.wx.getStorageSync(CLOUD_ENV_ID_KEY),
      service: globalThis.wx.getStorageSync(CLOUD_SERVICE_KEY),
      wsPath: globalThis.wx.getStorageSync(CLOUD_WS_PATH_KEY)
    }
  });
}

function resolveRuntimeConnection(options = {}) {
  const fixedConnection = getFixedRuntimeConnection();
  if (hasConnectableTarget(fixedConnection)) {
    return {
      ...fixedConnection,
      source: "fixed"
    };
  }

  const appGlobalData = options.appGlobalData && typeof options.appGlobalData === "object"
    ? options.appGlobalData
    : {};
  const appConnection = normalizeRuntimeConnection({
    wsUrl: appGlobalData.wsUrl,
    containerConfig: appGlobalData.containerConfig
  });
  if (hasConnectableTarget(appConnection)) {
    return {
      ...appConnection,
      source: "app"
    };
  }

  if (options.includeLegacyStorage === false) {
    return {
      ...appConnection,
      source: "missing"
    };
  }

  const legacyConnection = readLegacyRuntimeConnection();
  if (hasConnectableTarget(legacyConnection)) {
    return {
      ...legacyConnection,
      source: "legacy"
    };
  }

  return {
    ...legacyConnection,
    source: "missing"
  };
}

function clearLegacyRuntimeConnectionStorage() {
  if (!globalThis.wx || typeof globalThis.wx.setStorageSync !== "function") {
    return;
  }

  const defaultContainerConfig = getDefaultContainerConfig();
  globalThis.wx.setStorageSync(WS_URL_KEY, "");
  globalThis.wx.setStorageSync(CLOUD_ENV_ID_KEY, "");
  globalThis.wx.setStorageSync(CLOUD_SERVICE_KEY, "");
  globalThis.wx.setStorageSync(CLOUD_WS_PATH_KEY, defaultContainerConfig.wsPath);
}

module.exports = {
  FIXED_RUNTIME_CONNECTION,
  normalizeRuntimeConnection,
  hasConnectableTarget,
  getFixedRuntimeConnection,
  hasFixedRuntimeConnection,
  readLegacyRuntimeConnection,
  resolveRuntimeConnection,
  clearLegacyRuntimeConnectionStorage
};
