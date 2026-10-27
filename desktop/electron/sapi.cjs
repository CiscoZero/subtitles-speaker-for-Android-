"use strict";

/**
 * Windows SAPI bridge.
 *
 * Electron ships Chromium without the Windows speech component, so
 * `speechSynthesis.getVoices()` is empty in a packaged app. We therefore ask the
 * OS engine that Windows already has — System.Speech (SAPI 5) — through
 * PowerShell, and hand the renderer a base64 WAV data URL it can play with a
 * plain <audio> element.
 *
 * The PowerShell program is generated in memory and passed with
 * `-EncodedCommand` (UTF-16LE base64), so no script file has to survive inside
 * the asar archive and no text ever needs shell quoting.
 */

const { spawn } = require("node:child_process");

const POWERSHELL = process.env.ECHOTAPE_POWERSHELL || "powershell.exe";
const LIST_TIMEOUT_MS = 15_000;
const SPEAK_TIMEOUT_MS = 60_000;
const WAV_PREFIX = "data:audio/wav;base64,";

const PRELUDE = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
`;

/** The PowerShell child that is currently synthesizing, if any. */
let currentChild = null;

function encodeCommand(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function runPowerShell(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      POWERSHELL,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodeCommand(script)],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );

    currentChild = child;

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer = null;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (currentChild === child) currentChild = null;
      if (error) reject(error);
      else resolve(value);
    };

    timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      finish(new Error(`系统语音引擎没有响应（超过 ${Math.round(timeoutMs / 1000)} 秒）`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish(null, stdout.trim());
      else finish(new Error(stderr.trim() || `PowerShell 退出码 ${code}`));
    });
  });
}

function psLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function clampNumber(value, min, max, fallback) {
  const num = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, num));
}

/** UI rate (0.5–2×) → SAPI rate (-10…10, 0 = normal, ≈ ×2 per +5). */
function toSapiRate(rate) {
  return Math.max(-10, Math.min(10, Math.round((Math.log(rate) / Math.LN2) * 5)));
}

async function listVoices() {
  const script = `${PRELUDE}
$items = @()
foreach ($installed in $synth.GetInstalledVoices()) {
  if (-not $installed.Enabled) { continue }
  $info = $installed.VoiceInfo
  $items += [pscustomobject]@{ name = $info.Name; lang = $info.Culture.Name; gender = $info.Gender.ToString() }
}
$synth.Dispose()
if ($items.Count -eq 0) { [Console]::Out.Write('[]') } else { [Console]::Out.Write((ConvertTo-Json -InputObject @($items) -Compress -Depth 3)) }
`;

  const raw = await runPowerShell(script, LIST_TIMEOUT_MS);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((row) => row && typeof row.name === "string" && row.name.length > 0)
    .map((row) => ({
      name: row.name,
      lang: typeof row.lang === "string" ? row.lang : "",
      gender: typeof row.gender === "string" ? row.gender : "",
    }));
}

async function speak(options = {}) {
  const text = typeof options.text === "string" ? options.text.trim() : "";
  if (!text) throw new Error("没有需要朗读的文本。");

  const rate = clampNumber(options.rate, 0.5, 2, 1);
  const volume = clampNumber(options.volume, 0, 1, 1);
  const pitch = clampNumber(options.pitch, 0.5, 2, 1);
  const voice = typeof options.voice === "string" ? options.voice : "";

  const pitchPercent = Math.round((pitch - 1) * 100);
  const pitchAttr = `${pitchPercent > 0 ? "+" : ""}${pitchPercent}%`;
  const speakCall =
    pitchPercent === 0
      ? `$synth.Speak(${psLiteral(text)})`
      : `$ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><prosody pitch='${pitchAttr}'>" + [System.Security.SecurityElement]::Escape(${psLiteral(
          text,
        )}) + "</prosody></speak>"
try { $synth.SpeakSsml($ssml) } catch { $synth.Speak(${psLiteral(text)}) }`;

  const script = `${PRELUDE}
$synth.Rate = ${toSapiRate(rate)}
$synth.Volume = ${Math.round(volume * 100)}
${voice ? `try { $synth.SelectVoice(${psLiteral(voice)}) } catch { }` : ""}
$path = Join-Path ([System.IO.Path]::GetTempPath()) ("echotape-" + [guid]::NewGuid().ToString("N") + ".wav")
$synth.SetOutputToWaveFile($path)
try {
${speakCall}
} catch {
  $failure = $_
  Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  throw $failure
} finally {
  $synth.Dispose()
}
$bytes = [System.IO.File]::ReadAllBytes($path)
Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
[Console]::Out.Write([Convert]::ToBase64String($bytes))
`;

  const base64 = await runPowerShell(script, SPEAK_TIMEOUT_MS);
  if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("系统语音没有返回音频数据。");
  return WAV_PREFIX + base64;
}

/** Abort the running synthesis. Safe to call at any time. */
function cancel() {
  const child = currentChild;
  currentChild = null;
  if (!child || child.killed) return;
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  try {
    // PowerShell can spawn a helper; kill the whole tree so a stuck read ends here.
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.on("error", () => undefined);
  } catch {
    /* ignore */
  }
}

module.exports = { listVoices, speak, cancel };
