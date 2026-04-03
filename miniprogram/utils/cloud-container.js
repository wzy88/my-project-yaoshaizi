const {
  DEFAULT_CLOUD_ENV_ID,
  DEFAULT_CLOUD_SERVICE
} = require("./constants");

const DEFAULT_CONTAINER_WS_PATH = "/ws";
const DEFAULT_CONTAINER_CONFIG = Object.freeze({
  envId: DEFAULT_CLOUD_ENV_ID,
  service: DEFAULT_CLOUD_SERVICE,
  wsPath: DEFAULT_CONTAINER_WS_PATH
});

function normalizeContainerPath(value) {
  let path = String(value || "").trim();
  if (!path) {
    return DEFAULT_CONTAINER_WS_PATH;
  }
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  return path;
}

function normalizeContainerConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    envId: String(source.envId || "").trim(),
    service: String(source.service || "").trim(),
    wsPath: normalizeContainerPath(source.wsPath)
  };
}

function getDefaultContainerConfig() {
  return { ...DEFAULT_CONTAINER_CONFIG };
}

function resolveContainerConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const defaultConfig = getDefaultContainerConfig();

  return normalizeContainerConfig({
    envId: String(source.envId || "").trim() || defaultConfig.envId,
    service: String(source.service || "").trim() || defaultConfig.service,
    wsPath: String(source.wsPath || "").trim() || defaultConfig.wsPath
  });
}

function hasContainerService(raw) {
  return Boolean(normalizeContainerConfig(raw).service);
}

function buildContainerSummary(raw) {
  const config = normalizeContainerConfig(raw);
  if (!config.service) {
    return "未配置云托管";
  }

  const parts = [config.service, config.wsPath];
  if (config.envId) {
    parts.unshift(config.envId);
  }
  return parts.join(" / ");
}

function canUseCloudSocketApi() {
  return Boolean(
    globalThis.wx &&
    globalThis.wx.cloud &&
    typeof globalThis.wx.cloud.connectContainer === "function"
  );
}

function initMiniProgramCloud(raw) {
  const config = normalizeContainerConfig(raw);
  if (!globalThis.wx || !globalThis.wx.cloud || typeof globalThis.wx.cloud.init !== "function") {
    return {
      ok: false,
      reason: "当前基础库不支持云能力"
    };
  }

  const options = {
    traceUser: true
  };
  if (config.envId) {
    options.env = config.envId;
  }

  try {
    globalThis.wx.cloud.init(options);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error && error.message ? String(error.message) : "云能力初始化失败"
    };
  }
}

module.exports = {
  DEFAULT_CONTAINER_WS_PATH,
  DEFAULT_CONTAINER_CONFIG,
  normalizeContainerPath,
  normalizeContainerConfig,
  getDefaultContainerConfig,
  resolveContainerConfig,
  hasContainerService,
  buildContainerSummary,
  canUseCloudSocketApi,
  initMiniProgramCloud
};
