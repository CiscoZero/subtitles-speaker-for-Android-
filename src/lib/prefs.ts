import { DEFAULT_SETTINGS, type PlayerSettings } from "@/hooks/useEchoPlayer";

/**
 * Small local preferences store: voice choice and reading/sync tuning survive a
 * reload, so a 60-minute session does not need to be re-adjusted every time.
 * Nothing here ever leaves the machine.
 */

const KEY = "echotape.prefs.v1";

export type Prefs = {
  settings: PlayerSettings;
  voiceURI: string;
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

export function loadPrefs(): Prefs {
  const fallback: Prefs = { settings: { ...DEFAULT_SETTINGS }, voiceURI: "" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs> | null;
    const stored = (parsed?.settings ?? {}) as Partial<PlayerSettings>;
    const blockedWords = Array.isArray(stored.blockedWords)
      ? stored.blockedWords
          .filter((word): word is string => typeof word === "string")
          .map((word) => word.trim())
          .filter((word, index, words) => word.length > 0 && words.findIndex((value) => value.toLowerCase() === word.toLowerCase()) === index)
          .slice(0, 200)
      : [];
    return {
      settings: {
        autoPause: typeof stored.autoPause === "boolean" ? stored.autoPause : DEFAULT_SETTINGS.autoPause,
        offsetMs: Math.round(clamp(stored.offsetMs, -10000, 10000, DEFAULT_SETTINGS.offsetMs)),
        playbackRate: clamp(stored.playbackRate, 0.5, 2, DEFAULT_SETTINGS.playbackRate),
        ttsRate: clamp(stored.ttsRate, 0.5, 1.8, DEFAULT_SETTINGS.ttsRate),
        ttsVolume: clamp(stored.ttsVolume, 0, 1, DEFAULT_SETTINGS.ttsVolume),
        ttsPitch: clamp(stored.ttsPitch, 0.6, 1.5, DEFAULT_SETTINGS.ttsPitch),
        expiredPolicy: stored.expiredPolicy === "skip" ? "skip" : "read-all",
        blockedWords,
      },
      voiceURI: typeof parsed?.voiceURI === "string" ? parsed.voiceURI : "",
    };
  } catch {
    return fallback;
  }
}

export function savePrefs(prefs: Prefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage full or disabled — preferences are a nicety, not a requirement */
  }
}
