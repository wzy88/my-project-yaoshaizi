import type { DiceCall, OpenResultCountPlayer, RuleOptions } from "./types.js";

export function isValidCallInput(count: number, point: number): boolean {
  return Number.isInteger(count) && count > 0 && Number.isInteger(point) && point >= 1 && point <= 6;
}

export function isCallHigher(lastCall: DiceCall | undefined, nextCount: number, nextPoint: number): boolean {
  if (!lastCall) {
    return true;
  }

  if (nextCount > lastCall.count) {
    return true;
  }

  if (nextCount === lastCall.count && nextPoint > lastCall.point) {
    return true;
  }

  return false;
}

export function countPointWithOptions(
  allDice: number[][],
  point: number,
  options: RuleOptions
): number {
  return getPointCountBreakdown(allDice, point, options).total;
}

export function getPointCountBreakdown(
  allDice: number[][],
  point: number,
  options: RuleOptions,
  playerIds: string[] = []
): { total: number; players: OpenResultCountPlayer[] } {
  let total = 0;
  const players: OpenResultCountPlayer[] = [];

  for (const [playerIndex, diceList] of allDice.entries()) {
    const normalized = Array.isArray(diceList) ? diceList : [];
    const diceCount = normalized.length;
    const playerId = String(playerIds[playerIndex] || `P${playerIndex + 1}`);
    if (diceCount <= 0) {
      players.push({
        playerId,
        dice: [],
        contribution: 0,
        straight: false,
        leopardBonus: false
      });
      continue;
    }

    // House rules:
    // - Straight (strict consecutive, no duplicates) counts as 0 for all faces.
    // - Leopard (all same) adds +1 to that face.
    if (isStraight(normalized)) {
      players.push({
        playerId,
        dice: normalized.map((value, index) => ({
          index,
          value,
          counted: false,
          wildcard: false
        })),
        contribution: 0,
        straight: true,
        leopardBonus: false
      });
      continue;
    }

    const isLeopard = normalized.every((d) => d === normalized[0]);
    const leopardFace = isLeopard ? normalized[0] : 0;

    let pointCount = 0;
    let oneCount = 0;

    for (const dice of normalized) {
      if (dice === point) {
        pointCount += 1;
      }
      if (dice === 1) {
        oneCount += 1;
      }
    }

    if (point === 1) {
      const leopardBonus = Boolean(isLeopard && leopardFace === 1);
      const contribution = pointCount + (leopardBonus ? 1 : 0);
      total += contribution;
      players.push({
        playerId,
        dice: normalized.map((value, index) => ({
          index,
          value,
          counted: value === 1,
          wildcard: false
        })),
        contribution,
        straight: false,
        leopardBonus
      });
      continue;
    }

    if (options.oneAsWildcard) {
      const effectiveCount = pointCount + oneCount;
      if (effectiveCount === diceCount) {
        const contribution = diceCount + 1;
        total += contribution;
        players.push({
          playerId,
          dice: normalized.map((value, index) => ({
            index,
            value,
            counted: value === point || value === 1,
            wildcard: value === 1
          })),
          contribution,
          straight: false,
          leopardBonus: true
        });
        continue;
      }

      total += effectiveCount;
      players.push({
        playerId,
        dice: normalized.map((value, index) => ({
          index,
          value,
          counted: value === point || value === 1,
          wildcard: value === 1
        })),
        contribution: effectiveCount,
        straight: false,
        leopardBonus: false
      });
    } else {
      const leopardBonus = Boolean(isLeopard && leopardFace === point);
      const contribution = pointCount + (leopardBonus ? 1 : 0);
      total += contribution;
      players.push({
        playerId,
        dice: normalized.map((value, index) => ({
          index,
          value,
          counted: value === point,
          wildcard: false
        })),
        contribution,
        straight: false,
        leopardBonus
      });
    }
  }

  return { total, players };
}

function isStraight(diceList: number[]): boolean {
  const diceCount = diceList.length;
  if (diceCount < 2) {
    return false;
  }

  // D6 cannot have a strict straight longer than 6.
  if (diceCount > 6) {
    return false;
  }

  const unique = new Set<number>();
  for (const d of diceList) {
    unique.add(d);
  }
  if (unique.size !== diceCount) {
    return false;
  }

  const sorted = [...unique].sort((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== sorted[0] + index) {
      return false;
    }
  }

  return true;
}
