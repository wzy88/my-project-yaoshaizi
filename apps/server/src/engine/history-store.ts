import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RoundSummaryDTO } from "@dice/shared";

interface ListHistoryOptions {
  roomId: string;
  limit: number;
  beforeRound?: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_DIR = path.resolve(__dirname, "../../data/history");

export class HistoryStore {
  private ready = false;

  async saveRoundSummary(summary: RoundSummaryDTO): Promise<void> {
    await this.ensureReady();

    const file = this.getRoomFilePath(summary.roomId);
    const existing = await this.readRoomItems(summary.roomId);

    existing.push(summary);
    existing.sort((a, b) => b.round - a.round);

    await writeFile(file, JSON.stringify(existing, null, 2), "utf8");
  }

  async listHistory(options: ListHistoryOptions): Promise<{ items: RoundSummaryDTO[]; nextBeforeRound?: number }> {
    await this.ensureReady();

    const all = await this.readRoomItems(options.roomId);
    const normalizedLimit = Math.min(Math.max(options.limit, 1), 50);

    const beforeRound = options.beforeRound;
    const filtered = typeof beforeRound === "number"
      ? all.filter((item) => item.round < beforeRound)
      : all;

    const items = filtered.slice(0, normalizedLimit);
    const last = items[items.length - 1];

    return {
      items,
      nextBeforeRound: filtered.length > items.length && last ? last.round : undefined
    };
  }

  private getRoomFilePath(roomId: string): string {
    return path.join(HISTORY_DIR, `${roomId}.json`);
  }

  private async readRoomItems(roomId: string): Promise<RoundSummaryDTO[]> {
    const file = this.getRoomFilePath(roomId);

    try {
      const content = await readFile(file, "utf8");
      const parsed = JSON.parse(content) as RoundSummaryDTO[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) {
      return;
    }

    await mkdir(HISTORY_DIR, { recursive: true });
    this.ready = true;
  }
}
