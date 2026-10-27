"use strict";

/**
 * Pre-flight check: verifies that Windows SAPI can list voices and synthesize
 * Chinese before you spend time packaging.
 *
 *   cd desktop
 *   npm run check-voice
 *
 * Writes voice-check.wav next to this project so you can double-click and listen.
 */

const fs = require("node:fs");
const path = require("node:path");

const sapi = require("../electron/sapi.cjs");

const SAMPLE = "这是译声机的中文语音自测。原声会在这句话读完之后继续播放。";

async function main() {
  console.log("· 正在查询 Windows 语音引擎（System.Speech）…");
  const voices = await sapi.listVoices();

  if (!voices.length) {
    console.error("✗ 没有找到任何可用语音。");
    console.error("  Windows 设置 → 时间和语言 → 语音 → 添加语音 → 中文（简体），然后重试。");
    process.exit(1);
  }

  console.log(`✓ 找到 ${voices.length} 个语音：`);
  for (const voice of voices) {
    console.log(`   - ${voice.name}${voice.lang ? ` · ${voice.lang}` : ""}`);
  }

  const chinese = voices.filter((voice) => /^zh/i.test(voice.lang));
  if (!chinese.length) {
    console.warn("! 没有中文语音，将用默认语音朗读（发音可能不标准）。");
  }

  const chosen = chinese[0] ?? voices[0];
  console.log(`· 正在用「${chosen.name}」合成测试音频…`);

  const dataUrl = await sapi.speak({ text: SAMPLE, rate: 1, pitch: 1, volume: 1, voice: chosen.name });
  const base64 = dataUrl.replace(/^data:audio\/wav;base64,/, "");
  const out = path.join(process.cwd(), "voice-check.wav");
  fs.writeFileSync(out, Buffer.from(base64, "base64"));

  console.log(`✓ 合成成功（${Math.round(base64.length / 1024)} KB）`);
  console.log(`  试听文件：${out}`);
  console.log("  能听到中文即可继续 npm run dist 打包。");
}

main().catch((error) => {
  console.error("✗ 语音自测失败：", error && error.message ? error.message : error);
  console.error("  如果提示禁止运行脚本，请确认 PowerShell 可用：powershell -NoProfile -Command \"Get-Command Add-Type\"");
  process.exit(1);
});
