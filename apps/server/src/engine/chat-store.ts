import type { ChatListDTO, ChatMessageDTO } from "@dice/shared";

interface ChatStoreOptions {
  maxItems: number;
}

export class ChatStore {
  private readonly maxItems: number;
  private readonly roomMessages = new Map<string, ChatMessageDTO[]>();

  constructor(options: Partial<ChatStoreOptions> = {}) {
    this.maxItems = Number.isFinite(options.maxItems) ? Number(options.maxItems) : 80;
  }

  clearRoom(roomId: string): void {
    this.roomMessages.delete(roomId);
  }

  push(roomId: string, message: ChatMessageDTO): void {
    const current = this.roomMessages.get(roomId) || [];
    const next = [...current, message];
    const trimmed = next.length > this.maxItems ? next.slice(next.length - this.maxItems) : next;
    this.roomMessages.set(roomId, trimmed);
  }

  list(roomId: string, limit = 30): ChatListDTO {
    const normalizedLimit = Math.min(Math.max(Number(limit) || 30, 1), 80);
    const items = this.roomMessages.get(roomId) || [];
    const sliced = items.slice(Math.max(0, items.length - normalizedLimit));
    return {
      roomId,
      items: sliced,
      serverTs: Date.now()
    };
  }
}
