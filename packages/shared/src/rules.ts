import type { DiceCall, RuleOptions } from "./types.js";

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
  let total = 0;

  for (const diceList of allDice) {
    const normalized = Array.isArray(diceList) ? diceList : [];
    const diceCount = normalized.length;
    if (diceCount <= 0) {
      continue;
    }

    // House rules:
    // - Straight (strict consecutive, no duplicates) counts as 0 for all faces.
    // - Leopard (all same) adds +1 to that face.
    if (isStraight(normalized)) {
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
      total += pointCount;
      if (isLeopard && leopardFace === 1) {
        total += 1;
      }
      continue;
    }

    if (options.oneAsWildcard) {
      const effectiveCount = pointCount + oneCount;
      if (effectiveCount === diceCount) {
        total += diceCount + 1;
        continue;
      }

      total += effectiveCount;
    } else {
      total += pointCount;
      if (isLeopard && leopardFace === point) {
        total += 1;
      }
    }
  }

  return total;
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
