# 译声机 EchoTape 字幕朗读机 Android v1.5.7

## 主要更新

### 后台与息屏播放

- 原声播放及自动暂停等待 TTS 期间持有专用 Partial WakeLock。
- 连续播放时定时刷新 WakeLock，避免长时间息屏后被系统休眠中断。
- 划掉后台任务时，活跃的播放或朗读不会立即交给 Media3 默认逻辑停止服务。
- 系统 TTS 改用辅助语音音频属性，降低与主播放器抢占音频焦点的概率。
- 增加播放状态、音频焦点和 WakeLock 日志，便于继续排查厂商系统限制。

### LRC 朗读时机

- 中间 LRC 行优先使用“下一条时间戳 − 0.35 秒”作为结束边界。
- 长间隔也不再提前使用字数估算，避免日文原句尚未说完就开始中文朗读。
- 最后一条 LRC 使用“原音频结束 − 0.35 秒”，修复最后一句抢读。
- TXT 的结束时间仍使用语言和文字量估算。

### 原音频语言

- 新增自动、中文、日语、韩语、英语和其他语言选项。
- 自动识别日文假名、韩文、汉字和常见英文。
- 语言估算只用于 TXT 和 LRC 最后一行回退。

### 小米 TTS 语速与音高

- 非默认语速或音高时，系统 TTS 先合成 WAV。
- 合成音频由 Media3 ExoPlayer 通过 `PlaybackParameters` 执行变速和变调。
- 正式字幕朗读和“试听系统语音”使用相同路径。
- 调整语速、音高或音量后，当前句会重新生成并立即应用新设置。

### 播放体验

- 首页提供音频、字幕和最近记录快捷按钮。
- “最近”按钮只显示文字，不再显示数量。
- 最近音频和最近字幕各保存 6 项。
- 屏蔽词命中时跳过 TTS，原声继续。
- 新磁带图标和自适应启动器图标。

## 已包含功能

- Android 原生 Views 界面，不使用 WebView
- Media3 ExoPlayer 与 MediaSessionService
- 模式 A：字幕到点暂停原声，朗读后恢复
- 模式 B：原声连续播放，TTS 严格有序队列
- VTT、SRT、ASS、SSA、LRC、TXT
- SAF 文件选择
- Android 系统中文 TTS
- 后台播放、媒体通知和锁屏控制

## 安装

下载 `EchoTape-1.5.7-debug.apk` 后覆盖安装。

```text
versionName: 1.5.7
versionCode: 21
package: com.echotape.android
minSdk: 26
targetSdk: 36
```

## SHA-256

```text
DD2E58398343B6AE579F38EF698ED74FF5BF9DB0841D5D0E56787A740BF5E695
```

## 验证

- 已通过 Redmi Note 12 Turbo 真机测试。
- 共享解析与状态机测试 26 项通过。
- Android 原生测试新增 4 项后台播放规则测试通过。
- 后台与息屏播放修复仍需要在 Redmi Note 12 Turbo 上完成 20–30 分钟复测。
- APK 使用 Android Debug 签名，适合测试和侧载安装。
