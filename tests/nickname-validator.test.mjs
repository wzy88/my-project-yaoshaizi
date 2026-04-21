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
  assert.deepEqual(validateNicknameInput("Lucky 7"), {
    ok: true,
    value: "Lucky 7"
  });
});

test("server nickname validator rejects short, ad-like, and contact nicknames", async () => {
  const { validateNicknameInput } = await import(serverValidatorPath);

  assert.deepEqual(validateNicknameInput("A"), {
    ok: false,
    value: "A",
    message: "昵称需为2-12个字"
  });
  assert.deepEqual(validateNicknameInput("兼职接单"), {
    ok: false,
    value: "兼职接单",
    message: "昵称包含不合适的内容，请换一个"
  });
  assert.deepEqual(validateNicknameInput("abc@qq.com"), {
    ok: false,
    value: "abc@qq.com",
    message: "昵称包含不合适的内容，请换一个"
  });
});
