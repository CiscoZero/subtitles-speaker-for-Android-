import { useCallback, useEffect, useRef, useState } from "react";
import type { Cue } from "@/lib/subtitles";
import { speakText, stopSpeech, unlockSpeech } from "@/lib/tts";
import {
  PlaybackEngine,
  initialPlaybackSnapshot,
  type PlaybackSnapshot,
  type QueueClearReason,
} from "@/player/playbackEngine";

export type Phase = "idle" | "playing" | "speaking" | "paused" | "ended";

export type PlayerSettings = {
  /** Pause the original audio while a subtitle is read. */
  autoPause: boolean;
  /** Subtitle timing correction in milliseconds (+ = subtitles later). */
  offsetMs: number;
  /** Original audio speed. */
  playbackRate: number;
  ttsRate: number;
  ttsVolume: number;
  ttsPitch: number;
  /** What to do when several cues were passed before auto-pause resumed. */
  expiredPolicy: "read-all" | "skip";
  /** Any cue containing one of these terms is skipped without TTS. */
  blockedWords: string[];
};

export const DEFAULT_SETTINGS: PlayerSettings = {
  autoPause: true,
  offsetMs: 0,
  playbackRate: 1,
  ttsRate: 1,
  ttsVolume: 1,
  ttsPitch: 1,
  expiredPolicy: "read-all",
  blockedWords: [],
};

type Args = {
  cues: Cue[];
  settings: PlayerSettings;
  voice: SpeechSynthesisVoice | null;
  onError: (message: string) => void;
  onInfo?: (message: string) => void;
  enabled?: boolean;
};

function phaseFromSnapshot(snapshot: PlaybackSnapshot): Phase {
  if (snapshot.transport === "playing") return "playing";
  if (snapshot.autoPause && snapshot.speech === "speaking" && snapshot.transport === "paused") {
    return "speaking";
  }
  return snapshot.transport;
}

function queueClearMessage(count: number, reason: QueueClearReason): string {
  if (reason === "mode-switch") {
    return `已清空 ${count} 条未完成的朗读，后续字幕将自动暂停原声。`;
  }
  if (reason === "seek") {
    return `播放位置已改变，已清空 ${count} 条旧朗读。`;
  }
  if (reason === "user") {
    return `已清空 ${count} 条朗读。`;
  }
  if (reason === "audio-error") {
    return `音频异常，已清空 ${count} 条朗读。`;
  }
  return `文件已切换，已清空 ${count} 条旧朗读。`;
}

/**
 * React adapter for the platform-independent playback coordinator.
 *
 * Web/Electron continue to use HTMLAudioElement in this phase. Android will
 * later provide the same coordinator semantics inside a native service.
 */
export function useEchoPlayer({ cues, settings, voice, onError, onInfo, enabled = true }: Args) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(initialPlaybackSnapshot);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const cuesRef = useRef(cues);
  const settingsRef = useRef(settings);
  const voiceRef = useRef(voice);
  const errorRef = useRef(onError);
  const infoRef = useRef(onInfo);

  cuesRef.current = cues;
  settingsRef.current = settings;
  voiceRef.current = voice;
  errorRef.current = onError;
  infoRef.current = onInfo;

  useEffect(() => {
    if (!enabled) return;
    const audio = audioRef.current;
    if (!audio) return;

    const engine = new PlaybackEngine(
      {
        getTime: () => audioRef.current?.currentTime ?? 0,
        getDuration: () => audioRef.current?.duration ?? 0,
        play: () => {
          const element = audioRef.current;
          if (!element) return Promise.reject(new Error("Audio element is unavailable"));
          return element.play();
        },
        pause: () => audioRef.current?.pause(),
        seek: (seconds) => {
          const element = audioRef.current;
          if (!element) return;
          const max = element.duration > 0 ? element.duration : seconds;
          element.currentTime = Math.min(Math.max(0, seconds), Math.max(0, max - 0.03));
        },
      },
      {
        speak: (text) =>
          speakText(text, {
            voice: voiceRef.current,
            rate: settingsRef.current.ttsRate,
            pitch: settingsRef.current.ttsPitch,
            volume: settingsRef.current.ttsVolume,
          }),
        stop: stopSpeech,
      },
      {
        onChange: setSnapshot,
        onError: (message) => errorRef.current(message),
        onQueueCleared: (count, reason) => infoRef.current?.(queueClearMessage(count, reason)),
      },
    );

    engineRef.current = engine;
    engine.setCues(cuesRef.current);
    engine.updateSettings({
      autoPause: settingsRef.current.autoPause,
      offsetMs: settingsRef.current.offsetMs,
      expiredPolicy: settingsRef.current.expiredPolicy,
      blockedWords: settingsRef.current.blockedWords,
    });
    setSnapshot(engine.getSnapshot());

    return () => {
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    engineRef.current?.setCues(cues);
  }, [cues, enabled]);

  useEffect(() => {
    if (!enabled) return;
    engineRef.current?.updateSettings({
      autoPause: settings.autoPause,
      offsetMs: settings.offsetMs,
      expiredPolicy: settings.expiredPolicy,
      blockedWords: settings.blockedWords,
    });
  }, [enabled, settings.autoPause, settings.offsetMs, settings.expiredPolicy, settings.blockedWords]);

  useEffect(() => {
    if (!enabled) return;
    const audio = audioRef.current;
    if (audio) audio.playbackRate = settings.playbackRate;
  }, [enabled, settings.playbackRate]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let lastPaint = 0;

    const frame = (stamp: number) => {
      raf = window.requestAnimationFrame(frame);
      const audio = audioRef.current;
      if (!audio) return;

      if (stamp - lastPaint >= 90) {
        lastPaint = stamp;
        if (Number.isFinite(audio.currentTime)) setTime(audio.currentTime);
        if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      }
      engineRef.current?.tick();
    };

    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => engineRef.current?.tick();
    const onEnded = () => engineRef.current?.handleEnded();
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      setTime(audio.currentTime);
    };
    const onError = () => {
      if (!audio.getAttribute("src")) return;
      engineRef.current?.handleAudioError();
      errorRef.current(
        "无法解码这个音频文件：浏览器可能不支持该编码（如 ALAC / APE / WMA）。请先转成 MP3 / M4A / WAV / OGG 再装入。",
      );
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("error", onError);
    };
  }, [enabled]);

  const play = useCallback(async () => {
    unlockSpeech();
    await engineRef.current?.play();
    const audio = audioRef.current;
    if (audio) setTime(audio.currentTime);
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    const audio = audioRef.current;
    if (audio) setTime(audio.currentTime);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setTime(0);
  }, []);

  const seek = useCallback(
    (target: number, opts: { autoPlay?: boolean } = {}) => {
      void engineRef.current?.seek(target, opts).then(() => {
        const audio = audioRef.current;
        if (audio) setTime(audio.currentTime);
      });
    },
    [],
  );

  const jumpToCue = useCallback((index: number) => {
    void engineRef.current?.jumpToCue(index).then(() => {
      const audio = audioRef.current;
      if (audio) setTime(audio.currentTime);
    });
  }, []);

  const stepCue = useCallback((direction: 1 | -1) => {
    void engineRef.current?.stepCue(direction).then(() => {
      const audio = audioRef.current;
      if (audio) setTime(audio.currentTime);
    });
  }, []);

  const skipSpeech = useCallback(() => {
    engineRef.current?.skipSpeech();
  }, []);

  const clearSpeechQueue = useCallback(() => {
    engineRef.current?.clearSpeechQueue();
  }, []);

  return {
    audioRef,
    engineRef,
    phase: phaseFromSnapshot(snapshot),
    transport: snapshot.transport,
    speechState: snapshot.speech,
    time,
    duration,
    activeCue: snapshot.activeCue,
    pointer: snapshot.pointer,
    pendingSpeechCount: snapshot.pendingSpeechCount,
    autoPause: snapshot.autoPause,
    play,
    pause,
    stop,
    seek,
    jumpToCue,
    stepCue,
    skipSpeech,
    clearSpeechQueue,
    toggle: () =>
      snapshot.transport === "playing" || (snapshot.autoPause && snapshot.speech === "speaking")
        ? pause()
        : void play(),
  };
}
