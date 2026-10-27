import type { Cue } from "@/lib/subtitles";

export type NativePickedFile = {
  uri: string;
  name: string;
  size: number;
};

export type NativePickedSubtitle = NativePickedFile & {
  content: string;
  encoding: string;
};

export type NativePlaybackState = {
  transport: "idle" | "playing" | "paused" | "ended";
  speech: "idle" | "speaking" | "error";
  hasSession?: boolean;
  activeCue: number | null;
  lastBlockedCue?: number | null;
  pointer: number;
  pendingSpeechCount: number;
  autoPause: boolean;
  pauseReason: "none" | "auto" | "user";
  positionMs: number;
  durationMs: number;
  ttsReady: boolean;
  lastError: string;
};

export type NativeSubtitleSource = {
  name: string;
  format: "vtt" | "srt" | "ass" | "lrc" | "txt" | "";
  encoding: string;
  warnings: string[];
};

export type NativeSessionInfo = {
  hasSession: boolean;
  audioUri: string;
  audioName: string;
  subtitleName: string;
  subtitleFormat: "vtt" | "srt" | "ass" | "lrc" | "txt" | "";
  subtitleEncoding: string;
  subtitleWarnings: string[];
  cues: Cue[];
  positionMs: number;
};

export type NativeVoice = {
  name: string;
  lang: string;
  localService: boolean;
};

export type NativeSettings = {
  autoPause: boolean;
  offsetMs: number;
  playbackRate: number;
  ttsRate: number;
  ttsPitch: number;
  ttsVolume: number;
  expiredPolicy: "read-all" | "skip";
  blockedWords: string[];
};

type ListenerHandle = { remove: () => Promise<void> | void };

interface NativeEchoPlugin {
  pickAudio: () => Promise<NativePickedFile>;
  pickSubtitle: () => Promise<NativePickedSubtitle>;
  loadSession: (options: {
    audioUri: string;
    audioName: string;
    cues: Cue[];
    settings: NativeSettings;
    source: NativeSubtitleSource;
    startPositionMs?: number;
  }) => Promise<void>;
  getSession: () => Promise<NativeSessionInfo>;
  clearSession: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (options: { positionMs: number }) => Promise<void>;
  skipSpeech: () => Promise<void>;
  clearSpeechQueue: () => Promise<void>;
  updateSettings: (options: { settings: NativeSettings }) => Promise<void>;
  setVoice: (options: { name: string }) => Promise<void>;
  getState: () => Promise<NativePlaybackState>;
  getVoices: () => Promise<{ voices: NativeVoice[] }>;
  previewVoice: (options: {
    text: string;
    settings: NativeSettings;
  }) => Promise<void>;
  addListener(
    eventName: "stateChanged",
    listener: (state: NativePlaybackState) => void,
  ): Promise<ListenerHandle>;
  addListener(
    eventName: "queueCleared",
    listener: (event: { count: number; reason: string }) => void,
  ): Promise<ListenerHandle>;
}

type CapacitorGlobal = {
  getPlatform?: () => string;
  registerPlugin?: (name: string) => NativeEchoPlugin;
  Plugins?: {
    EchoNative?: NativeEchoPlugin;
  };
};

export function nativeEcho(): NativeEchoPlugin | null {
  if (typeof window === "undefined") return null;
  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (capacitor?.getPlatform?.() !== "android") return null;
  if (capacitor.Plugins?.EchoNative) return capacitor.Plugins.EchoNative;
  return capacitor.registerPlugin?.("EchoNative") ?? null;
}

export function nativeSettings(settings: NativeSettings): NativeSettings {
  return {
    autoPause: settings.autoPause,
    offsetMs: settings.offsetMs,
    playbackRate: settings.playbackRate,
    ttsRate: settings.ttsRate,
    ttsPitch: settings.ttsPitch,
    ttsVolume: settings.ttsVolume,
    expiredPolicy: settings.expiredPolicy,
    blockedWords: settings.blockedWords,
  };
}
