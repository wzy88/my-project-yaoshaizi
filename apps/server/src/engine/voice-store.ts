import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ErrorCode,
  GameError,
  type VoiceFetchedDTO,
  type VoiceListItemDTO,
  type VoiceUploadedDTO
} from "@dice/shared";
import { resolveDataPath } from "../utils/data-dir.js";

const VOICE_DIR = resolveDataPath("voice");

interface SaveVoiceInput {
  roomId: string;
  playerId: string;
  durationMs: number;
  fileName: string;
  mimeType: string;
  base64: string;
}

interface VoiceIndexItem extends VoiceListItemDTO {
  relativePath: string;
}

export class VoiceStore {
  private ready = false;

  async saveVoice(input: SaveVoiceInput): Promise<VoiceUploadedDTO> {
    await this.ensureReady();

    const fileId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const ext = this.resolveExt(input.fileName, input.mimeType);
    const roomSafe = this.safePart(input.roomId);
    const playerSafe = this.safePart(input.playerId);

    const roomDir = path.join(VOICE_DIR, roomSafe, playerSafe);
    await mkdir(roomDir, { recursive: true });

    const filePath = path.join(roomDir, `${fileId}.${ext}`);
    const relativePath = path.join(roomSafe, playerSafe, `${fileId}.${ext}`);

    let buffer: Buffer;
    try {
      buffer = Buffer.from(input.base64, "base64");
    } catch {
      throw new GameError(ErrorCode.BAD_REQUEST, "语音内容解析失败");
    }

    if (!buffer.length) {
      throw new GameError(ErrorCode.BAD_REQUEST, "语音内容为空");
    }

    await writeFile(filePath, buffer);

    const createdAt = Date.now();
    const mimeType = input.mimeType || this.extToMime(ext);

    const item: VoiceIndexItem = {
      fileId,
      playerId: input.playerId,
      durationMs: input.durationMs,
      mimeType,
      createdAt,
      relativePath
    };

    const index = await this.readIndex(input.roomId);
    index.unshift(item);
    await this.writeIndex(input.roomId, index);

    return {
      roomId: input.roomId,
      playerId: input.playerId,
      durationMs: input.durationMs,
      fileId,
      mimeType,
      createdAt,
      serverTs: Date.now()
    };
  }

  async listVoices(roomId: string, limit: number): Promise<VoiceListItemDTO[]> {
    await this.ensureReady();

    const normalizedLimit = Math.min(Math.max(limit || 10, 1), 30);
    const index = await this.readIndex(roomId);

    return index.slice(0, normalizedLimit).map((item) => ({
      fileId: item.fileId,
      playerId: item.playerId,
      durationMs: item.durationMs,
      mimeType: item.mimeType,
      createdAt: item.createdAt
    }));
  }

  async fetchVoice(roomId: string, fileId: string): Promise<VoiceFetchedDTO> {
    await this.ensureReady();

    const index = await this.readIndex(roomId);
    const hit = index.find((item) => item.fileId === fileId);

    if (!hit) {
      throw new GameError(ErrorCode.BAD_REQUEST, "语音不存在或已过期");
    }

    const absPath = path.join(VOICE_DIR, hit.relativePath);
    const buf = await readFile(absPath);

    return {
      roomId,
      fileId: hit.fileId,
      playerId: hit.playerId,
      durationMs: hit.durationMs,
      mimeType: hit.mimeType,
      base64: buf.toString("base64"),
      serverTs: Date.now()
    };
  }

  private getIndexFilePath(roomId: string): string {
    const roomSafe = this.safePart(roomId);
    return path.join(VOICE_DIR, roomSafe, "index.json");
  }

  private async readIndex(roomId: string): Promise<VoiceIndexItem[]> {
    const file = this.getIndexFilePath(roomId);

    try {
      const content = await readFile(file, "utf8");
      const parsed = JSON.parse(content) as VoiceIndexItem[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed;
    } catch {
      return [];
    }
  }

  private async writeIndex(roomId: string, index: VoiceIndexItem[]): Promise<void> {
    const roomSafe = this.safePart(roomId);
    await mkdir(path.join(VOICE_DIR, roomSafe), { recursive: true });
    await writeFile(this.getIndexFilePath(roomId), JSON.stringify(index, null, 2), "utf8");
  }

  private resolveExt(fileName: string, mimeType: string): string {
    const lowerFile = String(fileName || "").toLowerCase();
    if (lowerFile.endsWith(".mp3")) return "mp3";
    if (lowerFile.endsWith(".aac")) return "aac";
    if (lowerFile.endsWith(".wav")) return "wav";

    const lowerMime = String(mimeType || "").toLowerCase();
    if (lowerMime.includes("mpeg") || lowerMime.includes("mp3")) return "mp3";
    if (lowerMime.includes("aac")) return "aac";
    if (lowerMime.includes("wav")) return "wav";

    return "dat";
  }

  private extToMime(ext: string): string {
    if (ext === "mp3") return "audio/mpeg";
    if (ext === "aac") return "audio/aac";
    if (ext === "wav") return "audio/wav";
    return "application/octet-stream";
  }

  private safePart(input: string): string {
    return String(input || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) {
      return;
    }

    await mkdir(VOICE_DIR, { recursive: true });
    this.ready = true;
  }
}
