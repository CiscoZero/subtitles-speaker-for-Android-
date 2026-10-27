"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * Only the three TTS calls are exposed — the renderer never gets Node access.
 * src/lib/tts.ts picks this up through `window.echoTts`.
 */
contextBridge.exposeInMainWorld("echoTts", {
  listVoices: () => ipcRenderer.invoke("echo:tts:list"),
  speak: (options) => ipcRenderer.invoke("echo:tts:speak", options),
  cancel: () => ipcRenderer.send("echo:tts:cancel"),
});
