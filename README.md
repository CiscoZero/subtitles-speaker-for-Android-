# 译声机 EchoTape 字幕朗读机 for Android

译声机 EchoTape 是一个本机运行的 Android 字幕朗读机。用户可以分别选择本地音频和字幕文件，在原声播放到字幕时间点时，使用 Android 系统中文 TTS 朗读字幕。

Android 版本使用原生 Android Views，不依赖 WebView 运行界面。音频后台播放、媒体会话和统一字幕时钟由 Media3 提供。

## 下载

最新发布 APK：

- [GitHub Releases](https://github.com/CiscoZero/subtitles-speaker-for-Android/releases/latest)
- 最低系统：Android 8.0 / API 26
- 推荐测试环境：Android 15 及以上
- 当前发布包使用 Android Debug 签名，适合本地测试，不适合直接上架应用商店

## 功能

- 音频和字幕分别选择，文件名不需要相同
- VTT、SRT、ASS、SSA、LRC、TXT 字幕解析
- UTF-8 BOM、UTF-16、UTF-8、GB18030 编码识别
- Android 系统 TextToSpeech，不调用云端 TTS
- 字幕开始或字幕结束两种朗读触发时机
- VTT/SRT/ASS/SSA 使用文件中的真实字幕结束时间
- LRC 连续行使用下一条时间戳前 `0.35s` 作为结束边界
- LRC 最后一行使用原音频结束前 `0.35s`
- TXT 和最后一行回退时支持中、日、韩、英及其他语言估算
- 自动暂停模式 A：字幕到点暂停原声，朗读后从暂停位置继续
- 连续播放模式 B：原声持续播放，TTS 使用严格顺序队列
- 屏蔽词：命中屏蔽词的字幕跳过 TTS，原声继续
- 中文语音选择、朗读语速、音高、音量
- 小米 TTS 语速/音高兼容：系统 TTS 合成 WAV 后由 Media3 ExoPlayer 变速变调播放
- “试听系统语音”与正式朗读使用相同的 Media3 变速变调路径
- 最近音频和最近字幕，各保存最近 6 项
- SAF 文件选择器，不申请宽泛存储权限
- Media3 MediaSessionService：后台播放、媒体通知和锁屏控制

## 屏幕

- **播放**：快捷选择音频、字幕和打开最近记录；显示当前字幕、播放控制、屏蔽词队列
- **字幕**：搜索、浏览和跳转字幕
- **设置**：自动暂停、朗读时机、原音频语言、屏蔽词、语音、语速、音高、音量、原声速度和字幕偏移

## 项目结构

```text
src/                         React/TypeScript 共享前端与算法
desktop/                     Windows Electron 工程
mobile/                      Capacitor 构建辅助与 Android 工程
mobile/android/app/src/main/java/com/echotape/android/
  MainActivity.java          原生 Android UI
  EchoPlaybackService.java   Media3、MediaSession、TTS 和字幕时钟
  SubtitleParser.java        原生字幕解析和编码识别
  RecentStore.java           最近音频与最近字幕本地存储
  PlaybackBackgroundRules.java 后台播放与任务移除规则
  PlaybackRecoveryRules.java 进程恢复规则
```

Android 原生界面、服务和解析器不通过 WebView 加载。

## 构建

### 环境

- Node.js 22+
- pnpm 11
- JDK 17 或 21
- Android SDK Platform 36
- Android SDK Build Tools 35.0.0
- Gradle 8.14.3

### 安装依赖

在仓库根目录：

```powershell
pnpm install --frozen-lockfile
pnpm --dir mobile install --ignore-workspace --frozen-lockfile
```

### 生成 Debug APK

```powershell
cd mobile/android
.\gradlew.bat assembleDebug
```

APK 输出：

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### 安装

```powershell
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## 使用

1. 在首页点击“选择音频”，选择本地音频。
2. 点击“选择字幕”，选择字幕文件。
3. 在设置中选择“字幕开始时”或“字幕结束时”朗读。
4. 点击播放。
5. 之后可以从首页“最近”按钮直接打开最近音频和最近字幕。

## LRC 和 TXT 的结束时间

- LRC 只要存在下一条时间戳，就使用：

```text
当前行结束 = 下一条开始 - 0.35 秒
```

- LRC 最后一行使用：

```text
最后一行结束 = 原音频总时长 - 0.35 秒
```

- 最后一行之后存在很长纯音乐尾声时，中文朗读也会推迟到接近音频结束。
- TXT 没有原音频时间轴，继续按语言和文字量估算，限制为 1.2～12 秒。
- VTT、SRT、ASS、SSA 直接读取字幕文件中的真实结束时间。

## 验证状态

- 已通过 Redmi Note 12 Turbo 真机测试
- 已验证原生 Android 界面、文件导入、字幕朗读、最近记录和系统 TTS

## 已知限制

- LRC/TXT 的结束时间只是估算值。
- 部分厂商系统可能限制后台运行，建议将 EchoTape 设为允许后台运行。
- 系统 TTS 是否支持某种语音、语速和离线语音包取决于设备安装的 TTS 引擎。
- 当前 APK 为 Debug 签名测试包。

## 隐私

音频、字幕和朗读文本都在设备本机处理。应用不包含云端 TTS、分析 SDK 或文件上传功能。

## Windows 版本

Windows Electron/Web 源码仍然保留在 `src/` 和 `desktop/`，但 Android APK 使用原生 Android 界面与服务。
