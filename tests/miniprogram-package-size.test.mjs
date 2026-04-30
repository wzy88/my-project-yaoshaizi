import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MINIPROGRAM_ROOT = path.resolve("miniprogram");
const MAX_MAIN_PACKAGE_BYTES = 2 * 1024 * 1024;

function normalizePackagePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function getSubpackageRoots() {
  const appConfig = JSON.parse(fs.readFileSync(path.join(MINIPROGRAM_ROOT, "app.json"), "utf8"));
  return new Set(
    (appConfig.subPackages || appConfig.subpackages || [])
      .map((subpackage) => normalizePackagePath(String(subpackage.root || "").replace(/^\/+|\/+$/g, "")))
      .filter(Boolean)
  );
}

function shouldSkipMainPackageFile(relativePath, subpackageRoots) {
  const packagePath = normalizePackagePath(relativePath);
  return [...subpackageRoots].some((root) => packagePath === root || packagePath.startsWith(`${root}/`));
}

function getDirectorySizeBytes(dirPath, options = {}, rootPath = dirPath) {
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, entryPath);
    if (entry.isDirectory()) {
      total += getDirectorySizeBytes(entryPath, options, rootPath);
      continue;
    }
    if (
      options.subpackageRoots &&
      shouldSkipMainPackageFile(relativePath, options.subpackageRoots)
    ) {
      continue;
    }
    total += fs.statSync(entryPath).size;
  }
  return total;
}

test("miniprogram main package stays under the 2MB real-device limit", () => {
  const totalBytes = getDirectorySizeBytes(MINIPROGRAM_ROOT, {
    subpackageRoots: getSubpackageRoots()
  });
  assert.ok(
    totalBytes < MAX_MAIN_PACKAGE_BYTES,
    `miniprogram main package is ${(totalBytes / 1024 / 1024).toFixed(3)}MB, expected < 2.000MB`
  );
});

test("miniprogram main package does not keep unused premium PNG source assets", () => {
  const unusedLargePngs = [
    "assets/home-create-art-premium.png",
    "assets/home-logo-premium.png",
    "assets/home-table-bg-premium.png"
  ];

  for (const relativePath of unusedLargePngs) {
    assert.equal(
      fs.existsSync(path.join(MINIPROGRAM_ROOT, relativePath)),
      false,
      `${relativePath} should not be kept in the main package; use the compressed JPG variant instead`
    );
  }
});

test("miniprogram app config keeps custom-component lazy loading disabled for the room subpackage", () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(MINIPROGRAM_ROOT, "app.json"), "utf8"));

  assert.equal(
    Object.prototype.hasOwnProperty.call(appConfig, "lazyCodeLoading"),
    false,
    "lazyCodeLoading should stay disabled because the room page has no custom components and DevTools 3.14.x can trip on this subpackage path"
  );
});
