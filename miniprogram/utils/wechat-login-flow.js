const { loginWechatAccount } = require("./account-api");
const {
  requestWechatLogin,
  requestWechatUserProfile,
  persistWechatProfile
} = require("./wechat-auth");

async function performWechatOneTapLogin() {
  const userProfile = await requestWechatUserProfile();
  const loginRes = await requestWechatLogin();
  const accountSession = await loginWechatAccount({
    code: loginRes.code,
    nickname: userProfile.nickname,
    avatarUrl: userProfile.avatarUrl,
    nicknameCustomized: Boolean(userProfile.nicknameCustomized)
  });
  const nextProfile = accountSession && accountSession.profile ? accountSession.profile : {};
  const storedProfile = persistWechatProfile({
    nickname: String(nextProfile.nickname || userProfile.nickname || "").trim(),
    avatarUrl: String(nextProfile.avatarUrl || userProfile.avatarUrl || "").trim(),
    nicknameCustomized: typeof nextProfile.nicknameCustomized === "boolean"
      ? nextProfile.nicknameCustomized
      : Boolean(userProfile.nicknameCustomized),
    accountId: nextProfile.accountId,
    displayId: nextProfile.displayId,
    loginAt: loginRes.loginAt
  });

  return {
    accountSession,
    profile: storedProfile
  };
}

async function refreshWechatSessionSilently() {
  return performWechatOneTapLogin();
}

module.exports = {
  performWechatOneTapLogin,
  refreshWechatSessionSilently
};
