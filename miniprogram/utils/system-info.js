function readInfoFrom(apiName) {
  if (!globalThis.wx || typeof globalThis.wx[apiName] !== "function") {
    return null;
  }

  try {
    const info = globalThis.wx[apiName]();
    return info && typeof info === "object" ? info : null;
  } catch (error) {
    return null;
  }
}

function readPlatformFrom(apiName) {
  const info = readInfoFrom(apiName);
  if (!info || typeof info.platform !== "string") {
    return "";
  }
  return info.platform;
}

function getPlatform() {
  return (
    readPlatformFrom("getDeviceInfo") ||
    readPlatformFrom("getAppBaseInfo") ||
    readPlatformFrom("getSystemInfoSync")
  );
}

function isDevtoolsPlatform() {
  return getPlatform() === "devtools";
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getNavigationSafeArea() {
  const windowInfo = readInfoFrom("getWindowInfo") || readInfoFrom("getSystemInfoSync") || {};
  const safeArea = windowInfo && typeof windowInfo.safeArea === "object" ? windowInfo.safeArea : {};
  const menuRect = readInfoFrom("getMenuButtonBoundingClientRect") || {};

  const topInset = Math.max(
    toFiniteNumber(safeArea.top),
    toFiniteNumber(windowInfo.statusBarHeight)
  );

  let bottomInset = 0;
  const safeBottom = toFiniteNumber(safeArea.bottom);
  const screenHeight = toFiniteNumber(windowInfo.screenHeight);
  const windowHeight = toFiniteNumber(windowInfo.windowHeight);

  if (screenHeight > 0 && safeBottom > 0) {
    bottomInset = Math.max(0, screenHeight - safeBottom);
  } else if (screenHeight > 0 && windowHeight > 0) {
    bottomInset = Math.max(0, screenHeight - windowHeight - topInset);
  }

  const menuTop = Math.max(topInset, toFiniteNumber(menuRect.top));
  const menuHeight = Math.max(0, toFiniteNumber(menuRect.height));
  const menuBottom = Math.max(menuTop, toFiniteNumber(menuRect.bottom) || (menuTop + menuHeight));

  return {
    topInset,
    bottomInset,
    menuTop,
    menuHeight,
    menuBottom
  };
}

module.exports = {
  getPlatform,
  isDevtoolsPlatform,
  getNavigationSafeArea
};
