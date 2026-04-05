import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

import type {
  AccountLoginResultDTO,
  AccountProfileDTO,
  AccountStatsDTO,
  RecentRoomDTO,
  RoundSummaryDTO
} from "@dice/shared";

import { resolveDataPath } from "../utils/data-dir.js";

interface LoginInput {
  openId: string;
  unionId?: string;
  nickname: string;
  avatarUrl: string;
  loginAt?: number;
  authMode: AccountLoginResultDTO["authMode"];
}

interface SessionRecord {
  tokenHash: string;
  createdAt: number;
  lastUsedAt: number;
}

interface StoredAccountRecord {
  accountId: string;
  displayId: string;
  provider: "wechat";
  openId: string;
  unionId?: string;
  nickname: string;
  avatarUrl: string;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number;
  stats: AccountStatsDTO;
  recentRooms: RecentRoomDTO[];
  sessions: SessionRecord[];
}

interface StoredAccountData {
  version: 1;
  accounts: StoredAccountRecord[];
}

const ACCOUNT_DIR = resolveDataPath("accounts");
const ACCOUNT_FILE = path.join(ACCOUNT_DIR, "accounts.json");

function createEmptyStats(): AccountStatsDTO {
  return {
    totalRounds: 0,
    roundsWon: 0,
    roundsLost: 0,
    totalCallsMade: 0,
    totalOpenRequests: 0,
    roomsCreated: 0,
    roomsJoined: 0
  };
}

function normalizeNickname(value: unknown): string {
  return String(value || "").trim() || "玩家";
}

function normalizeAvatarUrl(value: unknown): string {
  return String(value || "").trim();
}

function createAccountId(): string {
  return `acct_${randomBytes(12).toString("hex")}`;
}

function createDisplayId(accountId: string): string {
  return `WX-${String(accountId || "").slice(-8).toUpperCase()}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function createSessionToken(): string {
  return randomBytes(24).toString("hex");
}

function normalizeStats(raw: unknown): AccountStatsDTO {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    totalRounds: Number(source.totalRounds) || 0,
    roundsWon: Number(source.roundsWon) || 0,
    roundsLost: Number(source.roundsLost) || 0,
    totalCallsMade: Number(source.totalCallsMade) || 0,
    totalOpenRequests: Number(source.totalOpenRequests) || 0,
    roomsCreated: Number(source.roomsCreated) || 0,
    roomsJoined: Number(source.roomsJoined) || 0,
    lastRoundAt: Number(source.lastRoundAt) || undefined
  };
}

function normalizeRecentRooms(raw: unknown): RecentRoomDTO[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const role = source.role === "owner" ? "owner" : "guest";
      const roomId = String(source.roomId || "").trim();
      const lastSeenAt = Number(source.lastSeenAt) || 0;
      if (!roomId || !lastSeenAt) {
        return null;
      }
      return {
        roomId,
        role,
        lastSeenAt
      };
    })
    .filter((item): item is RecentRoomDTO => Boolean(item));
}

function normalizeSessions(raw: unknown): SessionRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const tokenHash = String(source.tokenHash || "").trim();
      const createdAt = Number(source.createdAt) || 0;
      const lastUsedAt = Number(source.lastUsedAt) || createdAt;
      if (!tokenHash || !createdAt) {
        return null;
      }
      return {
        tokenHash,
        createdAt,
        lastUsedAt
      };
    })
    .filter((item): item is SessionRecord => Boolean(item));
}

function normalizeStoredAccountRecord(raw: unknown): StoredAccountRecord | null {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const accountId = String(source.accountId || "").trim();
  const displayId = String(source.displayId || "").trim();
  const openId = String(source.openId || "").trim();
  const nickname = normalizeNickname(source.nickname);
  const avatarUrl = normalizeAvatarUrl(source.avatarUrl);
  const createdAt = Number(source.createdAt) || 0;
  const updatedAt = Number(source.updatedAt) || createdAt || Date.now();
  const lastLoginAt = Number(source.lastLoginAt) || updatedAt;

  if (!accountId || !displayId || !openId || !createdAt) {
    return null;
  }

  return {
    accountId,
    displayId,
    provider: "wechat",
    openId,
    unionId: String(source.unionId || "").trim() || undefined,
    nickname,
    avatarUrl,
    createdAt,
    updatedAt,
    lastLoginAt,
    stats: normalizeStats(source.stats),
    recentRooms: normalizeRecentRooms(source.recentRooms),
    sessions: normalizeSessions(source.sessions)
  };
}

function toPublicProfile(record: StoredAccountRecord): AccountProfileDTO {
  return {
    accountId: record.accountId,
    displayId: record.displayId,
    provider: record.provider,
    nickname: record.nickname,
    avatarUrl: record.avatarUrl,
    createdAt: record.createdAt,
    lastLoginAt: record.lastLoginAt,
    stats: {
      ...record.stats
    },
    recentRooms: record.recentRooms.map((item) => ({ ...item }))
  };
}

export class AccountStore {
  private ready = false;

  async loginWithWechatIdentity(input: LoginInput): Promise<AccountLoginResultDTO> {
    await this.ensureReady();

    const data = await this.readData();
    const now = Number(input.loginAt) || Date.now();
    const nickname = normalizeNickname(input.nickname);
    const avatarUrl = normalizeAvatarUrl(input.avatarUrl);

    let account = this.findByWeChatIdentity(data.accounts, input.openId, input.unionId);
    if (!account) {
      const accountId = createAccountId();
      account = {
        accountId,
        displayId: createDisplayId(accountId),
        provider: "wechat",
        openId: String(input.openId || "").trim(),
        unionId: String(input.unionId || "").trim() || undefined,
        nickname,
        avatarUrl,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        stats: createEmptyStats(),
        recentRooms: [],
        sessions: []
      };
      data.accounts.push(account);
    }

    account.openId = String(input.openId || "").trim() || account.openId;
    if (input.unionId) {
      account.unionId = String(input.unionId || "").trim() || account.unionId;
    }
    account.nickname = nickname;
    account.avatarUrl = avatarUrl;
    account.lastLoginAt = now;
    account.updatedAt = now;

    const sessionToken = createSessionToken();
    const tokenHash = hashToken(sessionToken);
    account.sessions = [
      {
        tokenHash,
        createdAt: now,
        lastUsedAt: now
      },
      ...account.sessions.filter((session) => session.tokenHash !== tokenHash)
    ].slice(0, 8);

    await this.writeData(data);

    return {
      profile: toPublicProfile(account),
      sessionToken,
      loginAt: now,
      authMode: input.authMode
    };
  }

  async verifySession(accountId: string, sessionToken: string): Promise<AccountProfileDTO | null> {
    await this.ensureReady();

    const normalizedAccountId = String(accountId || "").trim();
    const normalizedTokenHash = hashToken(String(sessionToken || "").trim());
    if (!normalizedAccountId || !normalizedTokenHash) {
      return null;
    }

    const data = await this.readData();
    const account = data.accounts.find((item) => item.accountId === normalizedAccountId);
    if (!account) {
      return null;
    }

    if (!account.sessions.some((item) => item.tokenHash === normalizedTokenHash)) {
      return null;
    }

    return toPublicProfile(account);
  }

  async syncProfile(accountId: string, patch: { nickname?: string; avatarUrl?: string }): Promise<AccountProfileDTO | null> {
    await this.ensureReady();

    const normalizedAccountId = String(accountId || "").trim();
    if (!normalizedAccountId) {
      return null;
    }

    const data = await this.readData();
    const account = data.accounts.find((item) => item.accountId === normalizedAccountId);
    if (!account) {
      return null;
    }

    const nextNickname = String(patch.nickname || "").trim();
    const nextAvatarUrl = String(patch.avatarUrl || "").trim();
    if (nextNickname) {
      account.nickname = nextNickname;
    }
    if (nextAvatarUrl) {
      account.avatarUrl = nextAvatarUrl;
    }
    account.updatedAt = Date.now();

    await this.writeData(data);
    return toPublicProfile(account);
  }

  async touchRoom(accountId: string, roomId: string, role: "owner" | "guest"): Promise<void> {
    await this.ensureReady();

    const normalizedAccountId = String(accountId || "").trim();
    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedAccountId || !normalizedRoomId) {
      return;
    }

    const data = await this.readData();
    const account = data.accounts.find((item) => item.accountId === normalizedAccountId);
    if (!account) {
      return;
    }

    const now = Date.now();
    account.recentRooms = [
      {
        roomId: normalizedRoomId,
        role,
        lastSeenAt: now
      },
      ...account.recentRooms.filter((item) => item.roomId !== normalizedRoomId)
    ].slice(0, 12);

    if (role === "owner") {
      account.stats.roomsCreated += 1;
    } else {
      account.stats.roomsJoined += 1;
    }
    account.updatedAt = now;

    await this.writeData(data);
  }

  async recordRoundSummary(summary: RoundSummaryDTO): Promise<void> {
    await this.ensureReady();

    const boundPlayers = (summary.players || []).filter((player) => player && player.accountId);
    if (!boundPlayers.length) {
      return;
    }

    const data = await this.readData();
    const winnerIds = new Set((summary.openResult?.targets || []).map((target) => target.winnerId));
    const loserIds = new Set(
      (summary.openResult?.targets || []).map((target) => (
        target.winnerId === target.targetId ? summary.openResult.openerId : target.targetId
      ))
    );
    const openerId = String(summary.openResult?.openerId || "");
    const ts = Number(summary.serverTs) || Date.now();

    let changed = false;

    for (const player of boundPlayers) {
      const account = data.accounts.find((item) => item.accountId === player.accountId);
      if (!account) {
        continue;
      }

      account.stats.totalRounds += 1;
      if (player.call) {
        account.stats.totalCallsMade += 1;
      }
      if (player.playerId === openerId) {
        account.stats.totalOpenRequests += 1;
      }
      if (winnerIds.has(player.playerId)) {
        account.stats.roundsWon += 1;
      }
      if (loserIds.has(player.playerId)) {
        account.stats.roundsLost += 1;
      }
      account.stats.lastRoundAt = ts;
      account.updatedAt = ts;

      account.recentRooms = [
        {
          roomId: summary.roomId,
          role: this.findRecentRole(account.recentRooms, summary.roomId),
          lastSeenAt: ts
        },
        ...account.recentRooms.filter((item) => item.roomId !== summary.roomId)
      ].slice(0, 12);

      changed = true;
    }

    if (changed) {
      await this.writeData(data);
    }
  }
  private findRecentRole(items: RecentRoomDTO[], roomId: string): "owner" | "guest" {
    return items.find((item) => item.roomId === roomId)?.role || "guest";
  }

  private findByWeChatIdentity(
    accounts: StoredAccountRecord[],
    openId: string,
    unionId?: string
  ): StoredAccountRecord | undefined {
    const normalizedUnionId = String(unionId || "").trim();
    if (normalizedUnionId) {
      const hit = accounts.find((item) => item.unionId === normalizedUnionId);
      if (hit) {
        return hit;
      }
    }

    const normalizedOpenId = String(openId || "").trim();
    if (!normalizedOpenId) {
      return undefined;
    }

    return accounts.find((item) => item.openId === normalizedOpenId);
  }

  private async readData(): Promise<StoredAccountData> {
    try {
      const content = await readFile(ACCOUNT_FILE, "utf8");
      const parsed = JSON.parse(content) as { accounts?: unknown[] };
      if (parsed && Array.isArray(parsed.accounts)) {
        return {
          version: 1,
          accounts: parsed.accounts
            .map((item) => normalizeStoredAccountRecord(item))
            .filter((item): item is StoredAccountRecord => Boolean(item))
        };
      }
    } catch {
      // ignore file read failure
    }

    return {
      version: 1,
      accounts: []
    };
  }

  private async writeData(data: StoredAccountData): Promise<void> {
    await writeFile(ACCOUNT_FILE, JSON.stringify(data, null, 2), "utf8");
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) {
      return;
    }

    await mkdir(ACCOUNT_DIR, { recursive: true });
    this.ready = true;
  }
}
