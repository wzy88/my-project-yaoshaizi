import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const serverValidatorPath = pathToFileURL(
  path.join(process.cwd(), "apps/server/dist/utils/nickname-validator.js")
).href;

test("server nickname validator accepts ordinary nicknames and normalizes whitespace", async () => {
  const { validateNicknameInput } = await import(serverValidatorPath);

  assert.deepEqual(validateNicknameInput("  阿伟  "), {
    ok: true,
    value: "阿伟"
  });
  assert.deepEqual(validateNicknameInput("阿"), {
    ok: true,
    value: "阿"
  });
  assert.deepEqual(validateNicknameInput("玩家123"), {
    ok: true,
    value: "玩家123"
  });
  assert.deepEqual(validateNicknameInput("li hui"), {
    ok: true,
    value: "li hui"
  });
});

test("server nickname validator rejects long, ad-like, and contact nicknames", async () => {
  const { validateNicknameInput } = await import(serverValidatorPath);

  assert.deepEqual(validateNicknameInput("玩家12345678901"), {
    ok: false,
    value: "玩家12345678901",
    message: "昵称需为1-12个字符"
  });
  assert.deepEqual(validateNicknameInput("兼职接单"), {
    ok: false,
    value: "兼职接单",
    message: "昵称包含不合适的内容，请换一个"
  });
  assert.deepEqual(validateNicknameInput("qq123"), {
    ok: false,
    value: "qq123",
    message: "昵称包含不合适的内容，请换一个"
  });
});
