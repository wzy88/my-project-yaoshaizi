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
  return path.join(projectRoot, "miniprogram", String(asset || "").replace(/^\//, ""));
}

function countVisiblePips(svgSource) {
  return [...String(svgSource || "").matchAll(/fill="(?:var\(--fill-0,\s*)?#(?:1A1A2E|CC2020|55766D|143C35|1C1A20|0A0504|1F2E58|C92A2A|C99729|B92B24|7B0D0B|423730|C8A04A|893F2E|D4333D|3658A4|102A5A|252936)\)?"|fill="#(?:55766D|143C35|1C1A20|0A0504|1F2E58|C92A2A|C99729|B92B24|7B0D0B|423730|C8A04A|893F2E|D4333D|3658A4|102A5A|252936)"/g)].length;
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

test("shared dice assets: themed self dice resolve to the premium room assets", () => {
  const diceAssets = loadSharedDiceAssets();
  const themedExpectations = [
    ["jade-green", "/pages/room/assets/room-themes/jade-green-die-face-3.svg", /stop-color="#EBCB8A"/],
    ["ruby-red", "/pages/room/assets/room-themes/ruby-red-die-face-3.svg", /stop-color="#F8D978"/],
    ["imperial-red", "/pages/room/assets/room-themes/imperial-red-die-face-3.svg", /fill="#F7F0D8"/],
    ["glacier-blue", "/pages/room/assets/room-themes/glacier-blue-die-face-3.svg", /stop-color="#F7FCFF"/]
  ];

  for (const [themeId, expectedAsset, bodyColorPattern] of themedExpectations) {
    const asset = diceAssets.getSelfDieAsset(3, themeId);
    const assetPath = resolveMiniprogramAssetPath(asset);
    const svg = fs.readFileSync(assetPath, "utf8");
    assert.equal(asset, expectedAsset);
    assert.match(svg, bodyColorPattern);
    assert.equal(countVisiblePips(svg), 3, `${themeId} should render 3 visible pip(s)`);
    if (themeId === "jade-green") {
      assert.match(svg, /stroke="#9D6A38"/);
      assert.match(svg, /fill="#143C35"/);
      assert.doesNotMatch(svg, /fill="#B92B24"/);
      assert.doesNotMatch(svg, /fill="#C99729"/);
      assert.doesNotMatch(svg, /fill="#252936"/);
    }
    if (themeId === "imperial-red") {
      assert.match(svg, /stop-color="#FFF8E6"/);
      assert.match(svg, /fill="#7B0D0B"/);
      assert.match(svg, /fill="#FFD2A4"/);
      assert.doesNotMatch(svg, /fill="#2F754F"/);
      assert.doesNotMatch(svg, /fill="#D7E8BC"/);
      assert.doesNotMatch(svg, /fill="#E3B64A"/);
      assert.doesNotMatch(svg, /flood-color="#000000"/);
      assert.doesNotMatch(svg, /fill="#C99729"/);
    }
    if (themeId === "glacier-blue") {
      assert.match(svg, /stop-color="#DDF8FF"/);
      assert.match(svg, /fill="#102A5A"/);
      assert.match(svg, /fill="#F8FFFF"/);
      assert.doesNotMatch(svg, /fill="#B92B24"/);
      assert.doesNotMatch(svg, /fill="#C99729"/);
      assert.doesNotMatch(svg, /fill="#252936"/);
    }
  }

  assert.equal(diceAssets.getSelfDieAsset(3, "unsupported-theme"), diceAssets.DICE_FACE_ASSETS[3]);
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
