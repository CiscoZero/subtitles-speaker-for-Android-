"use strict";

const { app, BrowserWindow, Menu, ipcMain, protocol, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const sapi = require("./sapi.cjs");

/**
 * The web build is served from a privileged custom scheme instead of file://.
 * That keeps BrowserRouter working (pathname is "/"), keeps Vite's absolute
 * /assets/... URLs valid, and avoids file:// media/CORS quirks.
 */
const SCHEME = "echotape";
const APP_URL = `${SCHEME}://app/`;
const WEB_DIR = path.join(__dirname, "..", "web");
const WEB_ROOT = path.resolve(WEB_DIR);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

async function serveWebBuild(request) {
  let relative = "index.html";
  try {
    const { pathname } = new URL(request.url);
    const decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
    if (decoded) relative = decoded;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const target = path.resolve(WEB_ROOT, relative);
  if (target !== WEB_ROOT && !target.startsWith(WEB_ROOT + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  let file = target;
  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = path.join(file, "index.html");
  } catch {
    // Unknown extension → let the SPA router handle it; missing asset → 404.
    if (path.extname(relative)) return new Response("Not found", { status: 404 });
    file = path.join(WEB_ROOT, "index.html");
  }

  try {
    const body = await fs.readFile(file);
    return new Response(body, {
      headers: { "Content-Type": MIME_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" },
    });
  } catch {
    return new Response(
      `<h1>找不到网页构建产物</h1><p>请先在 desktop 目录运行 <code>npm run build:web</code>。</p>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 860,
    minHeight: 640,
    backgroundColor: "#F4E7CE",
    title: "译声机 EchoTape",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  void win.loadURL(APP_URL);
  return win;
}

function registerIpc() {
  ipcMain.handle("echo:tts:list", () => sapi.listVoices());

  ipcMain.handle("echo:tts:speak", (_event, options) => {
    const payload = options && typeof options === "object" ? options : {};
    return sapi.speak({
      text: typeof payload.text === "string" ? payload.text : "",
      rate: payload.rate,
      pitch: payload.pitch,
      volume: payload.volume,
      voice: typeof payload.voice === "string" ? payload.voice : "",
    });
  });

  ipcMain.on("echo:tts:cancel", () => sapi.cancel());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, serveWebBuild);
    Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  sapi.cancel();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => sapi.cancel());
