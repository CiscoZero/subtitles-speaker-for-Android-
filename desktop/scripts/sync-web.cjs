"use strict";

/**
 * Copies the root Vite build (../dist) into desktop/web, which is what
 * electron-builder packs. Keeping the copy inside this folder means packaging
 * never has to reach outside the app directory.
 */

const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "..", "dist");
const target = path.join(__dirname, "..", "web");

if (!fs.existsSync(path.join(source, "index.html"))) {
  console.error("✗ 找不到网站构建产物 dist/index.html，请先在项目根目录运行 npm run build。");
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log("✓ 已把网站构建产物同步到 desktop/web");
