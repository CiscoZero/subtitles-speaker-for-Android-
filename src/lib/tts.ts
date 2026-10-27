/**
 * Chinese TTS wrapper around the Web Speech API.
 * On Windows this uses the built-in Microsoft voices (SAPI / OneCore) through
 * Edge / Chrome, so no paid API and no upload of any text.
 */

export type SpeakResult = "done" | "cancelled" | "error";

export type SpeakOptions = {
  voice?: SpeechSynthesisVoice | null;
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
};

let activeToken = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Desktop (Electron) bridge. Chromium in Electron ships without the Windows
 * speech component, so the packaged app talks to SAPI through the main process
 * instead of the Web Speech API.
 */
type NativeTtsBridge = {
  listVoices: () => Promise<{ name: string; lang: string }[]>;
  speak: (options: {
    text: string;
    rate: number;
    pitch: number;
    volume: number;
    voice: string | null;
  }) => Promise<string>;
  cancel: () => void;
};

export function nativeTts(): NativeTtsBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { echoTts?: NativeTtsBridge }).echoTts;
  return bridge ?? null;
}

export async function listNativeVoices(): Promise<SpeechSynthesisVoice[]> {
  const bridge = nativeTts();
  if (!bridge) return [];
  try {
    const raw = await bridge.listVoices();
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((voice) => voice && typeof voice.name === "string" && voice.name.length > 0)
      .map(
        (voice) =>
          ({
            name: voice.name,
            voiceURI: voice.name,
            lang: voice.lang || "",
            localService: true,
            default: false,
          }) as unknown as SpeechSynthesisVoice,
      );
  } catch {
    return [];
  }
}

export function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return nativeTts() !== null || "speechSynthesis" in window;
}

export function isChineseVoice(voice: SpeechSynthesisVoice): boolean {
  if (/^zh\b|^zh[-_]/i.test(voice.lang || "")) return true;
  return /chinese|中文|普通话|國語|国语|putonghua|mandarin/i.test(voice.name || "");
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  const voices = window.speechSynthesis.getVoices() || [];
  return [...voices].sort((a, b) => {
    const aZh = isChineseVoice(a) ? 0 : 1;
    const bZh = isChineseVoice(b) ? 0 : 1;
    if (aZh !== bZh) return aZh - bZh;
    if (a.localService !== b.localService) return a.localService ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const chinese = voices.filter(isChineseVoice);
  const mainland = chinese.find((v) => /^zh[-_]?cn/i.test(v.lang) || /PRC|简体|mainland/i.test(v.name));
  return mainland ?? chinese[0] ?? null;
}

/** Split long subtitles into engine friendly chunks (some engines stop after ~15s). */
export function splitIntoSegments(text: string, maxLen = 70): string[] {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return [];
  const sentences = compact.match(/[^。！？!?；;…]+[。！？!?；;…]*/g) ?? [compact];
  const out: string[] = [];
  let buffer = "";

  const push = (piece: string) => {
    if (!piece) return;
    if (!buffer) {
      buffer = piece;
      return;
    }
    if ((buffer + piece).length <= maxLen) {
      buffer += piece;
      return;
    }
    out.push(buffer);
    buffer = piece;
  };

  for (const raw of sentences) {
    const piece = raw.trim();
    if (!piece) continue;
    if (piece.length <= maxLen) {
      push(piece);
      continue;
    }
    for (let i = 0; i < piece.length; i += maxLen) push(piece.slice(i, i + maxLen));
  }
  if (buffer) out.push(buffer);
  return out;
}

function estimateMs(text: string, rate: number): number {
  const perChar = 1000 / 3.6; // ≈3.6 Chinese chars per second at rate 1
  return Math.max(4000, (text.length * perChar) / Math.max(0.5, rate) + 4000);
}

function speakOne(text: string, opts: SpeakOptions): Promise<SpeakResult> {
  return new Promise<SpeakResult>((resolve) => {
    const token = ++activeToken;
    const utterance = new SpeechSynthesisUtterance(text);
    if (opts.voice) utterance.voice = opts.voice;
    utterance.lang = opts.lang || opts.voice?.lang || "zh-CN";
    utterance.rate = opts.rate ?? 1;
    utterance.pitch = opts.pitch ?? 1;
    utterance.volume = opts.volume ?? 1;

    let settled = false;
    let retried = false;
    let stuckTimer: number | undefined;

    const watchdog = window.setTimeout(
      () => finish("error"),
      estimateMs(text, utterance.rate),
    );

    function cleanup() {
      window.clearTimeout(watchdog);
      if (stuckTimer) window.clearTimeout(stuckTimer);
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
    }

    function finish(result: SpeakResult) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    // Chrome/Edge occasionally swallow the first utterance after a cancel().
    function guardStuckStart() {
      stuckTimer = window.setTimeout(() => {
        if (settled || token !== activeToken) return;
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return;
        if (retried) {
          finish("error");
          return;
        }
        retried = true;
        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        } catch {
          finish("error");
          return;
        }
        guardStuckStart();
      }, 2600);
    }

    utterance.onstart = () => {
      if (stuckTimer) window.clearTimeout(stuckTimer);
    };
    utterance.onend = () => finish(token === activeToken ? "done" : "cancelled");
    utterance.onerror = (event) => {
      if (token !== activeToken) return finish("cancelled");
      const error = (event as SpeechSynthesisErrorEvent).error;
      if (error === "interrupted" || error === "canceled") return finish("cancelled");
      finish("error");
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      finish("error");
      return;
    }
    guardStuckStart();
  });
}

let nativePlayer: HTMLAudioElement | null = null;
let nativeResolver: ((result: SpeakResult) => void) | null = null;

/** Abort whatever the SAPI bridge is doing and resolve the pending promise. */
function settleNative(result: SpeakResult) {
  const resolve = nativeResolver;
  nativeResolver = null;
  const player = nativePlayer;
  nativePlayer = null;
  if (player) {
    player.pause();
    player.removeAttribute("src");
  }
  nativeTts()?.cancel();
  resolve?.(result);
}

async function speakNative(text: string, opts: SpeakOptions): Promise<SpeakResult> {
  const bridge = nativeTts();
  if (!bridge) return "error";
  const token = ++activeToken;

  let audioUrl = "";
  try {
    audioUrl = await bridge.speak({
      text,
      rate: opts.rate ?? 1,
      pitch: opts.pitch ?? 1,
      volume: opts.volume ?? 1,
      voice: opts.voice?.voiceURI ?? null,
    });
  } catch {
    return token === activeToken ? "error" : "cancelled";
  }
  if (token !== activeToken) return "cancelled";
  if (!audioUrl) return "error";

  return new Promise<SpeakResult>((resolve) => {
    const audio = new Audio(audioUrl);
    nativePlayer = audio;
    nativeResolver = resolve;
    const finish = (result: SpeakResult) => {
      if (nativeResolver !== resolve) return;
      nativeResolver = null;
      if (nativePlayer === audio) nativePlayer = null;
      resolve(result);
    };
    audio.onended = () => finish("done");
    audio.onerror = () => finish("error");
    void audio.play().catch(() => finish("error"));
  });
}

/** Speak a whole subtitle, chunk by chunk. Resolves only when the reading is finished. */
export async function speakText(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> {
  if (!isSpeechSupported()) return "error";
  const segments = splitIntoSegments(text, 70);
  if (!segments.length) return "done";

  if (nativeTts()) {
    stopSpeech();
    for (const segment of segments) {
      const result = await speakNative(segment, opts);
      if (result !== "done") return result;
    }
    return "done";
  }

  stopSpeech();
  const queuedToken = activeToken;
  await sleep(70); // let cancel() settle before queueing new audio
  if (queuedToken !== activeToken) return "cancelled";

  for (const segment of segments) {
    const result = await speakOne(segment, opts);
    if (result !== "done") return result;
  }
  return "done";
}

export function stopSpeech(): void {
  if (!isSpeechSupported()) return;
  activeToken += 1;
  if (nativeTts()) {
    // Desktop: stop the audio element and kill the running SAPI process.
    settleNative("cancelled");
    return;
  }
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch {
    /* ignore */
  }
}

/** Unlock speech synthesis inside a user gesture so later calls are allowed. */
export function unlockSpeech(): void {
  if (!isSpeechSupported() || nativeTts()) return;
  try {
    const warmup = new SpeechSynthesisUtterance(" ");
    warmup.volume = 0;
    warmup.rate = 1;
    window.speechSynthesis.speak(warmup);
  } catch {
    /* ignore */
  }
}
