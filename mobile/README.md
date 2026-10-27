# EchoTape Android

Android 应用使用原生 Android Views，不启动 WebView。React/TypeScript 源码仍保留在仓库根目录，用于 Windows/Web 和共享算法测试。

## 要求

- Node.js 22 或更新版本
- pnpm 11
- JDK 17 或 21
- Android SDK Platform 36
- Android SDK Build Tools
- 已安装中文语音包的 Android 系统 TTS 引擎

当前配置：

```text
minSdkVersion: 26
compileSdkVersion: 36
targetSdkVersion: 36
```

## 构建

从仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm --dir mobile install --ignore-workspace --frozen-lockfile
cd mobile/android
.\gradlew.bat assembleDebug
```

APK 输出：

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

安装：

```powershell
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## Android 架构

- `MainActivity.java`：原生 Android UI、SAF、最近记录和设置
- `EchoPlaybackService.java`：Media3、MediaSessionService、字幕时钟和系统 TTS
- `SubtitleParser.java`：VTT、SRT、ASS/SSA、LRC、TXT
- `RecentStore.java`：最近音频和最近字幕
- `PlaybackRecoveryRules.java`：进程恢复规则

Capacitor 仅保留构建辅助配置；最终 APK 不包含 Capacitor 类或 Web 资源。
