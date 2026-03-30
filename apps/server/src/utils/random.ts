import { randomInt, randomUUID } from "node:crypto";

export function createPlayerId(): string {
  return randomUUID();
}

export function createResumeToken(): string {
  return randomUUID();
}

export function createRoomId(existingIds: Set<string>): string {
  let candidate = "";

  do {
    candidate = String(randomInt(100000, 1000000));
  } while (existingIds.has(candidate));

  return candidate;
}

export function rollDice(diceCount: number): number[] {
  return Array.from({ length: diceCount }, () => randomInt(1, 7));
}
