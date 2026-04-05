const {
  WS_URL_KEY,
  CLOUD_ENV_ID_KEY,
  CLOUD_SERVICE_KEY,
  CLOUD_WS_PATH_KEY
} = require("./constants");
const {
  resolveContainerConfig,
  hasContainerService
} = require("./cloud-container");

function getRuntimeApp() {
  if (typeof getApp === "function") {
    try {
      return getApp();
    } catch (error) {
      return null;
    }
  }
  return null;
}

function getRuntimeConnection() {
  const app = getRuntimeApp();
  const globalData = app && app.globalData ? app.globalData : {};
  const wsUrl = String(
    globalData.wsUrl ||
    (globalThis.wx && typeof globalThis.wx.getStorageSync === "function" ? globalThis.wx.getStorageSync(WS_URL_KEY) : "") ||
    ""
  ).trim();
  const containerConfig = resolveContainerConfig(
    globalData.containerConfig || {
      envId: globalThis.wx && typeof globalThis.wx.getStorageSync === "function" ? globalThis.wx.getStorageSync(CLOUD_ENV_ID_KEY) : "",
      service: globalThis.wx && typeof globalThis.wx.getStorageSync === "function" ? globalThis.wx.getStorageSync(CLOUD_SERVICE_KEY) : "",
      wsPath: globalThis.wx && typeof globalThis.wx.getStorageSync === "function" ? globalThis.wx.getStorageSync(CLOUD_WS_PATH_KEY) : ""
    }
  );

  return {
    wsUrl,
    containerConfig
  };
}

function hasBackendConnection(raw) {
  const source = raw && typeof raw === "object" ? raw : getRuntimeConnection();
  const wsUrl = String(source.wsUrl || "").trim();
  const containerConfig = resolveContainerConfig(source.containerConfig || {});
  if (hasContainerService(containerConfig)) {
    return true;
  }

  return Boolean(deriveHttpBaseUrl(wsUrl, containerConfig.wsPath));
}

function buildMissingBackendMessage(raw) {
  const source = raw && typeof raw === "object" ? raw : getRuntimeConnection();
  const wsUrl = String(source.wsUrl || "").trim();
  const containerConfig = resolveContainerConfig(source.containerConfig || {});

  if (!hasContainerService(containerConfig) && !wsUrl) {
    return "未配置云托管服务，请先填写服务名，路径一般填 /ws";
  }

  if (wsUrl && !/^wss?:\/\//i.test(wsUrl)) {
    return "调试地址格式不正确，请使用 ws:// 或 wss://";
  }

  return "未配置后端服务地址";
}

function deriveHttpBaseUrl(wsUrl, wsPath) {
  const raw = String(wsUrl || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const normalized = raw.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
    const parsed = new URL(normalized);
    const normalizedWsPath = String(wsPath || "").trim();
    let nextPath = parsed.pathname || "/";

    if (normalizedWsPath && nextPath.endsWith(normalizedWsPath)) {
      nextPath = nextPath.slice(0, nextPath.length - normalizedWsPath.length) || "/";
    } else if (nextPath.endsWith("/ws")) {
      nextPath = nextPath.slice(0, nextPath.length - 3) || "/";
    }

    parsed.pathname = nextPath === "/" ? "/" : nextPath.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";

    return parsed.toString().replace(/\/$/, "");
  } catch (error) {
    return "";
  }
}

function normalizePath(pathname) {
  const value = String(pathname || "").trim() || "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function resolveBackendErrorMessage({ statusCode, data, errMsg, path }) {
  const defaultMessage = data && typeof data === "object" && data.message
    ? String(data.message)
    : (errMsg ? String(errMsg) : `请求失败（${statusCode || "unknown"}）`);

  const normalizedPath = normalizePath(path);
  const normalizedMessage = defaultMessage.trim().toLowerCase();
  const isLegacyNotFound = statusCode === 404 && normalizedMessage === "not found";

  if (!isLegacyNotFound) {
    return defaultMessage;
  }

  if (normalizedPath === "/api/auth/wechat-login") {
    return "当前后端服务里没有微信登录接口，请确认服务名或地址正确，并重新部署最新后端";
  }

  if (normalizedPath === "/api/account/me" || normalizedPath === "/api/account/profile") {
    return "当前后端服务里没有账号接口，请确认服务名或地址正确，并重新部署最新后端";
  }

  return defaultMessage;
}

function normalizeResponse(res, requestContext = {}) {
  const statusCode = Number(res && res.statusCode) || 0;
  const data = res && typeof res === "object" && "data" in res ? res.data : undefined;
  if (statusCode >= 200 && statusCode < 300) {
    return data;
  }

  const message = resolveBackendErrorMessage({
    statusCode,
    data,
    errMsg: res && res.errMsg,
    path: requestContext.path
  });
  const error = new Error(message);
  error.statusCode = statusCode;
  error.responseData = data;
  throw error;
}

function requestByCallContainer({ path, method, data, headers, containerConfig }) {
  return new Promise((resolve, reject) => {
    if (!globalThis.wx || !globalThis.wx.cloud || typeof globalThis.wx.cloud.callContainer !== "function") {
      reject(new Error("当前微信版本不支持云托管请求"));
      return;
    }

    globalThis.wx.cloud.callContainer({
      config: containerConfig.envId ? { env: containerConfig.envId } : {},
      path,
      method,
      header: {
        ...headers,
        "X-WX-SERVICE": containerConfig.service
      },
      data,
      success: (res) => {
        try {
          resolve(normalizeResponse(res, { path }));
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => {
        const message = error && error.errMsg ? String(error.errMsg) : "云托管请求失败";
        reject(new Error(message));
      }
    });
  });
}

function requestByHttp({ path, method, data, headers, baseUrl }) {
  return new Promise((resolve, reject) => {
    if (!globalThis.wx || typeof globalThis.wx.request !== "function") {
      reject(new Error("当前环境不支持网络请求"));
      return;
    }

    globalThis.wx.request({
      url: `${baseUrl}${path}`,
      method,
      data,
      header: headers,
      success: (res) => {
        try {
          resolve(normalizeResponse(res, { path }));
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => {
        const message = error && error.errMsg ? String(error.errMsg) : "请求失败";
        reject(new Error(message));
      }
    });
  });
}

function requestBackend(options) {
  const method = String(options && options.method || "GET").trim().toUpperCase();
  const path = normalizePath(options && options.path);
  const data = options && Object.prototype.hasOwnProperty.call(options, "data") ? options.data : undefined;
  const headers = options && options.headers && typeof options.headers === "object"
    ? { ...options.headers }
    : {};

  const { wsUrl, containerConfig } = getRuntimeConnection();

  if (hasContainerService(containerConfig)) {
    return requestByCallContainer({
      path,
      method,
      data,
      headers,
      containerConfig
    });
  }

  const baseUrl = deriveHttpBaseUrl(wsUrl, containerConfig.wsPath);
  if (!baseUrl) {
    return Promise.reject(new Error(buildMissingBackendMessage({
      wsUrl,
      containerConfig
    })));
  }

  return requestByHttp({
    path,
    method,
    data,
    headers,
    baseUrl
  });
}

module.exports = {
  requestBackend,
  deriveHttpBaseUrl,
  getRuntimeConnection,
  hasBackendConnection,
  buildMissingBackendMessage,
  resolveBackendErrorMessage
};
