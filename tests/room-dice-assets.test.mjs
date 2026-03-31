import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const roomScriptPath = path.join(projectRoot, "miniprogram/pages/room/room.js");

function readRoomDieAssetMap() {
  const source = fs.readFileSync(roomScriptPath, "utf8");
  const match = source.match(/const FIGMA_DIE_ASSETS = \{([\s\S]*?)\n\};/);
  assert.ok(match, "FIGMA_DIE_ASSETS should exist in room.js");

  return new Map(
    [...match[1].matchAll(/(\d+):\s*"([^"]+)"/g)].map(([, point, asset]) => [Number(point), String(asset)])
  );
}

function resolveMiniprogramAssetPath(asset) {
  return path.join(projectRoot, "miniprogram", String(asset || "").replace(/^\/assets\//, "assets/"));
}

function countVisiblePips(svgSource) {
  return [...String(svgSource || "").matchAll(/fill="(?:var\(--fill-0,\s*)?#(?:1A1A2E|CC2020|55766D)\)?"|fill="#55766D"/g)].length;
}

test("room dice assets: all stage dice map to complete dice bodies", () => {
  const assetMap = readRoomDieAssetMap();
  assert.deepEqual([...assetMap.keys()].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);

  for (const [point, asset] of assetMap.entries()) {
    const assetPath = resolveMiniprogramAssetPath(asset);
    const svg = fs.readFileSync(assetPath, "utf8");

    assert.match(
      svg,
      /(linearGradient id="dieBody"|fill="var\(--fill-0, #F7F5F0\)")/,
      `point ${point} should use a complete die body asset`
    );
    assert.equal(
      countVisiblePips(svg),
      point,
      `point ${point} asset should render ${point} visible pip(s)`
    );
  }
});
