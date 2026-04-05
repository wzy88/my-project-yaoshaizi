import { createHash } from "node:crypto";

import {
  WECHAT_APP_ID,
  WECHAT_APP_SECRET,
  WECHAT_AUTH_MOCK,
  WECHAT_CODE2SESSION_URL
} from "../config.js";

export interface ResolvedWechatIdentity {
  openId: string;
  unionId?: string;
  authMode: "wechat" | "mock";
}

interface WechatCode2SessionResponse {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

function buildMockIdentity(code: string): ResolvedWechatIdentity {
  const normalized = String(code || "").trim() || "guest";
  const hash = createHash("sha1").update(normalized).digest("hex");
  return {
    openId: `mock_openid_${hash.slice(0, 24)}`,
    unionId: `mock_unionid_${hash.slice(0, 24)}`,
    authMode: "mock"
  };
}

export async function resolveWechatIdentity(params: {
  code: string;
  forwardedOpenId?: string;
  forwardedUnionId?: string;
}): Promise<ResolvedWechatIdentity> {
  const code = String(params.code || "").trim();
  const forwardedOpenId = String(params.forwardedOpenId || "").trim();
  const forwardedUnionId = String(params.forwardedUnionId || "").trim();

  if (forwardedOpenId) {
    return {
      openId: forwardedOpenId,
      unionId: forwardedUnionId || undefined,
      authMode: "wechat"
    };
  }

  if (WECHAT_AUTH_MOCK) {
    return buildMockIdentity(code);
  }

  if (!code) {
    throw new Error("缺少微信登录 code");
  }

  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
    throw new Error("服务端未配置微信登录参数");
  }

  const endpoint = new URL(WECHAT_CODE2SESSION_URL);
  endpoint.searchParams.set("appid", WECHAT_APP_ID);
  endpoint.searchParams.set("secret", WECHAT_APP_SECRET);
  endpoint.searchParams.set("js_code", code);
  endpoint.searchParams.set("grant_type", "authorization_code");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`微信登录校验失败（HTTP ${response.status}）`);
  }

  const result = await response.json() as WechatCode2SessionResponse;
  if (result.errcode) {
    throw new Error(result.errmsg || "微信登录校验失败");
  }

  const openId = String(result.openid || "").trim();
  if (!openId) {
    throw new Error("未获取到微信用户标识");
  }

  return {
    openId,
    unionId: String(result.unionid || "").trim() || undefined,
    authMode: "wechat"
  };
}
