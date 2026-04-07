const LEGACY_PROFILE_AVATAR_ASSETS = [
  "/assets/figma-room-v2/39b17e1f-9114-410f-85d5-2e5a189fbf74.svg",
  "/assets/figma-room-v2/7ca66ac8-3c55-4b22-ae77-b2bf38f68295.svg",
  "/assets/figma-room-v2/c34dc9c6-7896-4b4d-adbe-c1e0c86f2471.svg",
  "/assets/figma-room-v2/210fcfda-928e-4840-a3e3-173c823b96b8.svg",
  "/assets/figma-room-v2/fae378fc-f9e8-496b-a6c8-fee07102a3e1.svg",
  "/assets/figma-room-v2/bf7e06ef-5ad9-474e-b2b3-6bbd604fb91f.svg"
];

const PREVIOUS_DEFAULT_PROFILE_AVATAR_ASSETS = [
  "/assets/figma-room-v2/avatar-blossom.svg",
  "/assets/figma-room-v2/avatar-butterfly.svg",
  "/assets/figma-room-v2/avatar-hibiscus.svg",
  "/assets/figma-room-v2/avatar-cat.svg",
  "/assets/figma-room-v2/avatar-fox.svg",
  "/assets/figma-room-v2/avatar-gamepad.svg"
];

const REMOVED_PROFILE_AVATAR_ASSETS = [
  "/assets/figma-room-v2/avatar-woman.svg",
  "/assets/figma-room-v2/avatar-woman.png"
];

const DEFAULT_PROFILE_AVATAR_ASSETS = [
  "/assets/figma-room-v2/avatar-blossom.png",
  "/assets/figma-room-v2/avatar-butterfly.png",
  "/assets/figma-room-v2/avatar-hibiscus.png",
  "/assets/figma-room-v2/avatar-cat.png",
  "/assets/figma-room-v2/avatar-fox.png",
  "/assets/figma-room-v2/avatar-gamepad.png"
];

function trimText(value) {
  return String(value || "").trim();
}

function looksLikeGeneratedNickname(value) {
  return /^玩家\d{3}$/.test(trimText(value));
}

function hashSeed(seed) {
  const source = trimText(seed) || "dice-profile";
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 131 + source.charCodeAt(index)) % 2147483647;
  }
  return Math.abs(hash);
}

function buildProfileSeed(source = {}, fallbackSeed = "") {
  const profile = source && typeof source === "object" ? source : {};
  return trimText(fallbackSeed)
    || trimText(profile.seed)
    || trimText(profile.accountId)
    || trimText(profile.displayId)
    || trimText(profile.openId)
    || trimText(profile.unionId)
    || trimText(profile.nickname)
    || trimText(profile.avatarUrl)
    || "dice-profile";
}

function pickDefaultAvatar(seed) {
  const size = DEFAULT_PROFILE_AVATAR_ASSETS.length || 1;
  const index = hashSeed(seed) % size;
  return DEFAULT_PROFILE_AVATAR_ASSETS[index] || DEFAULT_PROFILE_AVATAR_ASSETS[0] || "";
}

function normalizeBundledAvatarAsset(avatarUrl, seed = "") {
  const normalized = trimText(avatarUrl);
  if (!normalized) {
    return pickDefaultAvatar(seed);
  }

  if (DEFAULT_PROFILE_AVATAR_ASSETS.includes(normalized)) {
    return normalized;
  }

  if (REMOVED_PROFILE_AVATAR_ASSETS.includes(normalized)) {
    return pickDefaultAvatar(seed);
  }

  const previousDefaultIndex = PREVIOUS_DEFAULT_PROFILE_AVATAR_ASSETS.indexOf(normalized);
  if (previousDefaultIndex >= 0) {
    return DEFAULT_PROFILE_AVATAR_ASSETS[previousDefaultIndex % DEFAULT_PROFILE_AVATAR_ASSETS.length] || normalized;
  }

  const legacyIndex = LEGACY_PROFILE_AVATAR_ASSETS.indexOf(normalized);
  if (legacyIndex >= 0) {
    return DEFAULT_PROFILE_AVATAR_ASSETS[legacyIndex % DEFAULT_PROFILE_AVATAR_ASSETS.length] || normalized;
  }

  return normalized;
}

function buildDefaultNickname(seed) {
  const suffix = String(hashSeed(seed) % 1000).padStart(3, "0");
  return `玩家${suffix}`;
}

function ensureProfileDefaults(profile, options = {}) {
  const source = profile && typeof profile === "object" ? profile : {};
  const seed = buildProfileSeed(source, options.seed);
  const nickname = trimText(source.nickname) || buildDefaultNickname(seed);
  const avatarUrl = normalizeBundledAvatarAsset(source.avatarUrl, seed);

  return {
    ...source,
    nickname,
    avatarUrl
  };
}

function createRandomProfileDefaults() {
  const randomSeed = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  return {
    seed: randomSeed,
    ...ensureProfileDefaults({}, { seed: randomSeed })
  };
}

module.exports = {
  LEGACY_PROFILE_AVATAR_ASSETS,
  PREVIOUS_DEFAULT_PROFILE_AVATAR_ASSETS,
  DEFAULT_PROFILE_AVATAR_ASSETS,
  buildDefaultNickname,
  looksLikeGeneratedNickname,
  pickDefaultAvatar,
  normalizeBundledAvatarAsset,
  ensureProfileDefaults,
  createRandomProfileDefaults
};
