# 译声机 EchoTape · 桌面版（打包成 .exe）

这个目录是一个独立的 Electron 打包工程，用来把仓库根目录里的网页版变成 Windows 桌面应用：
双击图标启动、有开始菜单快捷方式、可以产出安装包 `Setup .exe` 和免安装的单文件 `portable .exe`。

## 为什么需要这个“桥”

网页版用浏览器的 Web Speech API 朗读中文，语音来自 Windows 系统。
但 Electron 自带的 Chromium **不包含** Windows 语音组件 —— 在打包后的应用里
`speechSynthesis.getVoices()` 会返回空列表，一句也读不出来。

所以桌面版换成一条系统通道：

```
渲染进程 (src/lib/tts.ts)
   → window.echoTts  (contextBridge, desktop/electron/preload.cjs)
      → IPC
         → 主进程 (desktop/electron/main.cjs → sapi.cjs)
            → powershell.exe + System.Speech.Synthesis  (Windows 自带，离线)
               → base64 WAV data URL
```

- 语音列表：`GetInstalledVoices()`，界面里的「中文语音」下拉就是这些。
- 朗读：先把整句合成成 WAV，再用 `<audio>` 播放，播完（`onended`）才恢复原声，
  “读完整才继续”的规则和网页版完全一致。
- 打断：`tts:cancel` 直接杀掉正在跑的 PowerShell 子进程，`跳过本句朗读` / 暂停立刻生效。
- 语速映射：界面 0.5×–2× → SAPI `Rate` -10…10；音高 → SSML `prosody pitch`（失败自动回退纯文本朗读）。
- 网页文件不走 `file://`，而是自定义特权协议 `echotape://app/`：`BrowserRouter`、Vite 的
  `/assets/...` 绝对路径、媒体加载都照旧，未知路径回落到 `index.html`。

## 前置条件

- Windows 10 / 11 x64
- Node.js 18 或更高（`node -v` 可查看）
- 系统里装好中文语音：**设置 → 时间和语言 → 语音 → 添加语音 → 中文（简体）**
  （装了 Microsoft Huihui / Xiaoxiao 之类即可）

## 三步出包

```bat
cd desktop
npm install
npm run check-voice
```

`check-voice` 会列出系统语音、合成一句测试音频到 `desktop/voice-check.wav`。
**能听到中文**再继续：

```bat
npm run start   :: 先当桌面应用跑一遍，确认朗读正常
npm run dist    :: 正式打包
```

产物在 `desktop/release/`：

- `EchoTape Setup 1.0.0.exe` — 安装版（可选择安装目录，创建开始菜单快捷方式）
- `EchoTape 1.0.0.exe` — 便携版，双击即用，不需要安装

只想出便携版：`npm run dist:portable`。

## 脚本说明

| 命令 | 作用 |
| --- | --- |
| `npm run build:web` | 在项目根目录执行 Vite 构建，并把 `dist/` 同步进 `desktop/web/` |
| `npm run start` | 构建 + 直接启动桌面版（开发/试用） |
| `npm run check-voice` | 只用系统语音做自测，不打包 |
| `npm run dist` | 构建 + 打包安装版和便携版 |
| `npm run dist:portable` | 构建 + 只打包便携版 |

`desktop/web/`、`desktop/release/`、`node_modules/` 都被 `.gitignore` 忽略；
**网页代码只维护一份**（仓库 `src/`），改完网页回到 `desktop` 重新 `npm run dist` 即可。

## 图标

`build/icon.svg` 是矢量原图。electron-builder 需要 512×512 的 `build/icon.png`
（Windows 会自动转成 `.ico`）。把任意 512×512 的 PNG 放进 `build/icon.png` 即可；
没有该文件时打包使用 Electron 默认图标，不会报错。

## 常见问题

- **`npm install` 很慢 / 卡在 electron 下载**：Electron 二进制约 100MB。可先设置镜像：
  `npm config set ELECTRON_MIRROR https://npmmirror.com/mirrors/electron/` 后重试。
- **首次运行 SmartScreen 警告**：安装包没有代码签名证书，Windows 会提示“未知发布者”。
  点「更多信息 → 仍要运行」；企业内部使用建议自行购买签名证书后在
  `build.win` 里配置 `certificateFile` / `certificatePassword`。
- **朗读失败、下拉为空**：说明系统没装中文语音（见前置条件），或 PowerShell 被组策略禁用。
  可先用 `npm run check-voice` 定位是哪一步出问题。
  桥接默认调用 Windows PowerShell 5.1（`powershell.exe`，自带 System.Speech）；如果你的机器
  只开放 `pwsh` 且装了 System.Speech 模块，可用环境变量 `ECHOTAPE_POWERSHELL` 指定解释器。
- **杀毒软件报警**：无签名 + NSIS 打包常见误报，添加信任即可。
- **改完网页没生效**：桌面版读的是 `desktop/web/`（构建产物），必须重新 `npm run dist` 或 `npm run start`。
- **不想要安装包**：直接 `npm run dist:portable`，把 `release/EchoTape 1.0.0.exe` 拷给别人就能用。
