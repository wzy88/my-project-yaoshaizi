import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const projectRoot = process.cwd();
const require = createRequire(import.meta.url);
const roomScriptPath = path.join(projectRoot, "miniprogram/pages/room/room.js");
const indexScriptPath = path.join(projectRoot, "miniprogram/pages/index/index.js");
const indexWxmlPath = path.join(projectRoot, "miniprogram/pages/index/index.wxml");
const lobbyScriptPath = path.join(projectRoot, "miniprogram/pages/lobby/lobby.js");
const lobbyWxmlPath = path.join(projectRoot, "miniprogram/pages/lobby/lobby.wxml");
const sharedAssetModulePath = path.join(projectRoot, "miniprogram/utils/dice-assets.js");

function loadSharedDiceAssets() {
  return require(sharedAssetModulePath);
}

function resolveMiniprogramAssetPath(asset) {
  return path.join(projectRoot, "miniprogram", String(asset || "").replace(/^\/assets\//, "assets/"));
}

function countVisiblePips(svgSource) {
  return [...String(svgSource || "").matchAll(/fill="(?:var\(--fill-0,\s*)?#(?:1A1A2E|CC2020|55766D)\)?"|fill="#55766D"/g)].length;
}

test("shared dice assets: all stage dice map to complete dice bodies", () => {
  const diceAssets = loadSharedDiceAssets();
  const assetMap = new Map(Object.entries(diceAssets.DICE_FACE_ASSETS).map(([point, asset]) => [Number(point), asset]));
  assert.deepEqual([...assetMap.keys()].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);

  for (const [point, asset] of assetMap.entries()) {
    const assetPath = resolveMiniprogramAssetPath(asset);
    const svg = fs.readFileSync(assetPath, "utf8");

    assert.match(
      svg,
      /(linearGradient id="dieBody"|fill="var\(--fill-0, #(F7F5F0|F5F3EE)\)")/,
      `point ${point} should use a complete die body asset`
    );
    assert.equal(
      countVisiblePips(svg),
      point,
      `point ${point} asset should render ${point} visible pip(s)`
    );
  }
});

test("shared dice assets: self dice fall back to the standard room dice assets across themes", () => {
  const diceAssets = loadSharedDiceAssets();
  assert.equal(diceAssets.getSelfDieAsset(3, "ruby-red"), diceAssets.DICE_FACE_ASSETS[3]);
  assert.equal(diceAssets.getSelfDieAsset(3, "sapphire-blue"), diceAssets.DICE_FACE_ASSETS[3]);
  assert.equal(diceAssets.getSelfDieAsset(3, "jade-green"), diceAssets.DICE_FACE_ASSETS[3]);
  assert.equal(diceAssets.getSelfDieAsset(3, "imperial-red"), diceAssets.DICE_FACE_ASSETS[3]);
  assert.equal(diceAssets.getSelfDieAsset(3, "mist-ivory"), diceAssets.DICE_FACE_ASSETS[3]);
});

test("shared dice assets: room, index, and lobby all consume the common module", () => {
  const roomSource = fs.readFileSync(roomScriptPath, "utf8");
  const indexSource = fs.readFileSync(indexScriptPath, "utf8");
  const indexWxml = fs.readFileSync(indexWxmlPath, "utf8");
  const lobbySource = fs.readFileSync(lobbyScriptPath, "utf8");
  const lobbyWxml = fs.readFileSync(lobbyWxmlPath, "utf8");

  assert.match(roomSource, /require\("\.\.\/\.\.\/utils\/dice-assets"\)/);
  assert.match(indexSource, /require\("\.\.\/\.\.\/utils\/dice-assets"\)/);
  assert.match(lobbySource, /require\("\.\.\/\.\.\/utils\/dice-assets"\)/);

  assert.doesNotMatch(indexWxml, /\/assets\/figma-room-v2\/[A-Za-z0-9-]+\.svg/);
  assert.doesNotMatch(lobbyWxml, /\/assets\/figma-room-v2\/[A-Za-z0-9-]+\.svg/);
});
