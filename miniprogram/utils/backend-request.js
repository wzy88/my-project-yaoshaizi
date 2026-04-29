const {
  resolveContainerConfig,
  hasContainerService
} = require("./cloud-container");
const { resolveRuntimeConnection } = require("./runtime-backend-config");

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
  return resolveRuntimeConnection({
    appGlobalData: app && app.globalData ? app.globalData : {},
    includeLegacyStorage: true
  });
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
    return "当前服务暂不可用，请稍后再试";
  }

  if (wsUrl && !/^wss?:\/\//i.test(wsUrl)) {
    return "当前服务连接异常，请稍后再试";
  }

  return "当前服务暂不可用，请稍后再试";
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
    return "当前服务暂不可用，请稍后再试";
  }

  if (normalizedPath === "/api/account/me" || normalizedPath === "/api/account/profile") {
    return "当前服务暂不可用，请稍后再试";
  }

  if (normalizedPath === "/api/room-exists") {
    return "当前服务端版本较旧，请先发布最新服务";
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

function resolveContainerFailMessage(errorLike) {
  const rawMessage = errorLike && errorLike.errMsg ? String(errorLike.errMsg) : "云托管请求失败";
  if (/INVALID_HOST/i.test(rawMessage)) {
    return "当前服务连接异常，请稍后再试";
  }
  return rawMessage;
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
        reject(new Error(resolveContainerFailMessage(error)));
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

async function checkRoomExists(roomId) {
  const normalizedRoomId = String(roomId || "").trim();
  if (!/^\d{6}$/.test(normalizedRoomId)) {
    return false;
  }

  const response = await requestBackend({
    path: "/api/room-exists",
    method: "POST",
    data: {
      roomId: normalizedRoomId
    }
  });

  const data = response && response.data ? response.data : response;
  return Boolean(data && data.exists);
}

module.exports = {
  requestBackend,
  checkRoomExists,
  deriveHttpBaseUrl,
  getRuntimeConnection,
  hasBackendConnection,
  buildMissingBackendMessage,
  resolveBackendErrorMessage,
  resolveContainerFailMessage
};
