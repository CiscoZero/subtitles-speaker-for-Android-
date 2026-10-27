# 译声机 EchoTape 字幕朗读机 Android v1.4.3

## 主要更新

- 新增小米系统 TTS 语速兼容：
  - 非默认语速和音高先由系统 TTS 合成 WAV
  - 使用 Android MediaPlayer 在应用层调整播放速度和音高
  - 不再完全依赖小米 TTS 引擎是否执行 `setSpeechRate`
- 调整语速、音高或音量后，当前字幕会重新朗读，立即生效
- “最近”按钮恢复为纯文字，不再显示数量
- 新增按文字字数估算 LRC/TXT 字幕结束时间
  - 中文约 4 字/秒
  - 其他非空白字符约 10 字符/秒
  - 时长限制为 1.2 至 12 秒
- VTT、SRT、ASS、SSA 继续使用真实字幕结束时间

## 已包含功能

- Android 原生 Views 界面，不使用 WebView
- Media3 ExoPlayer 与 MediaSessionService
- 模式 A：字幕到点暂停原声，朗读后恢复
- 模式 B：原声连续播放，TTS 严格有序队列
- 屏蔽词
- 最近播放和最近字幕
- VTT、SRT、ASS、SSA、LRC、TXT
- SAF 文件选择
- Android 系统中文 TTS

## 安装

下载 `EchoTape-1.4.3-debug.apk` 后覆盖安装。

```text
versionName: 1.4.3
versionCode: 13
package: com.echotape.android
minSdk: 26
targetSdk: 36
```

## SHA-256

```text
4CD16DAC0B9015C16846DA6BB1BA5BA43EA3F2F82095521F84BC6B24C65084D5
```

## 说明

此版本已在 Redmi Note 12 Turbo 真机测试通过。APK 使用 Android Debug 签名，适合测试和侧载安装。
