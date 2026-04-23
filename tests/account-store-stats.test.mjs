import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("account store: only opener and opened target count toward win-rate rounds", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "dice-account-store-stats-"));
  const previousDataDir = process.env.DICE_DATA_DIR;
  process.env.DICE_DATA_DIR = dataDir;

  try {
    const { AccountStore } = await import("../apps/server/dist/engine/account-store.js");
    const store = new AccountStore();
    const loginAt = 1710000000000;
    const playerA = await store.loginWithWechatIdentity({
      openId: "open-a",
      nickname: "玩家A",
      avatarUrl: "",
      loginAt,
      authMode: "mock"
    });
    const playerB = await store.loginWithWechatIdentity({
      openId: "open-b",
      nickname: "玩家B",
      avatarUrl: "",
      loginAt,
      authMode: "mock"
    });
    const playerC = await store.loginWithWechatIdentity({
      openId: "open-c",
      nickname: "玩家C",
      avatarUrl: "",
      loginAt,
      authMode: "mock"
    });

    await store.recordRoundSummary({
      roomId: "R_STATS",
      round: 1,
      serverTs: loginAt + 1000,
      players: [
        {
          playerId: "P_A",
          accountId: playerA.profile.accountId,
          nickname: "玩家A",
          avatar: "",
          dice: [2, 2, 2, 3, 4],
          call: null
        },
        {
          playerId: "P_B",
          accountId: playerB.profile.accountId,
          nickname: "玩家B",
          avatar: "",
          dice: [1, 3, 4, 5, 6],
          call: {
            count: 3,
            point: 2,
            by: "P_B",
            ts: loginAt + 500
          }
        },
        {
          playerId: "P_C",
          accountId: playerC.profile.accountId,
          nickname: "玩家C",
          avatar: "",
          dice: [6, 6, 4, 3, 2],
          call: {
            count: 2,
            point: 6,
            by: "P_C",
            ts: loginAt + 300
          }
        }
      ],
      openResult: {
        round: 1,
        openerId: "P_A",
        targets: [
          {
            targetId: "P_B",
            declared: {
              count: 3,
              point: 2
            },
            actual: 2,
            winnerId: "P_A"
          }
        ],
        serverTs: loginAt + 1000
      }
    });

    const profileA = await store.verifySession(playerA.profile.accountId, playerA.sessionToken);
    const profileB = await store.verifySession(playerB.profile.accountId, playerB.sessionToken);
    const profileC = await store.verifySession(playerC.profile.accountId, playerC.sessionToken);

    assert.equal(profileA.stats.totalRounds, 1);
    assert.equal(profileA.stats.roundsWon, 1);
    assert.equal(profileA.stats.roundsLost, 0);
    assert.equal(profileA.stats.totalOpenRequests, 1);
    assert.equal(profileB.stats.totalRounds, 1);
    assert.equal(profileB.stats.roundsWon, 0);
    assert.equal(profileB.stats.roundsLost, 1);
    assert.equal(profileC.stats.totalRounds, 0);
    assert.equal(profileC.stats.roundsWon, 0);
    assert.equal(profileC.stats.roundsLost, 0);
    assert.equal(profileC.stats.totalCallsMade, 1);
    assert.equal(profileC.stats.lastRoundAt, undefined);
  } finally {
    if (typeof previousDataDir === "string") {
      process.env.DICE_DATA_DIR = previousDataDir;
    } else {
      delete process.env.DICE_DATA_DIR;
    }
    await rm(dataDir, { recursive: true, force: true });
  }
});
