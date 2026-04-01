const DEFAULT_CONTAINER_WS_PATH = "/ws";

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
  normalizeContainerPath,
  normalizeContainerConfig,
  hasContainerService,
  buildContainerSummary,
  canUseCloudSocketApi,
  initMiniProgramCloud
};
