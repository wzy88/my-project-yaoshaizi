import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveBackendErrorMessage } = require("../miniprogram/utils/backend-request.js");

test("backend request helper rewrites legacy room-exists 404 into a deploy hint", () => {
  const message = resolveBackendErrorMessage({
    statusCode: 404,
    data: { message: "not found" },
    path: "/api/room-exists"
  });

  assert.equal(message, "当前服务端版本较旧，请先发布最新服务");
});
