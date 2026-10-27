import { useCallback, useEffect, useRef, useState } from "react";
import type { Cue } from "@/lib/subtitles";
import {
  nativeEcho,
  nativeSettings,
  type NativePlaybackState,
  type NativeSubtitleSource,
} from "@/platform/androidNative";
import type { Phase, PlayerSettings } from "@/hooks/useEchoPlayer";

const EMPTY: NativePlaybackState = {
  transport: "idle",
  speech: "idle",
  hasSession: false,
  activeCue: null,
  pointer: 0,
  pendingSpeechCount: 0,
  autoPause: true,
  pauseReason: "none",
  positionMs: 0,
  durationMs: 0,
  ttsReady: false,
  lastError: "",
};

function phaseFromNative(state: NativePlaybackState): Phase {
  if (state.transport === "playing") return "playing";
  if (state.autoPause && state.speech === "speaking" && state.transport === "paused") {
    return "speaking";
  }
  return state.transport;
}

type Args = {
  enabled: boolean;
  audioUri: string | null;
  audioName: string | null;
  cues: Cue[];
  subtitleSource: NativeSubtitleSource;
  settings: PlayerSettings;
  voiceName: string;
  initializing: boolean;
  startPositionMs: number;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
};

export function useNativeEchoPlayer({
  enabled,
  audioUri,
  audioName,
  cues,
  subtitleSource,
  settings,
  voiceName,
  initializing,
  startPositionMs,
  onError,
  onInfo,
}: Args) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const errorRef = useRef(onError);
  const infoRef = useRef(onInfo);
  const settingsRef = useRef(settings);
  const lastErrorRef = useRef("");
  const lastLoadedAudioUriRef = useRef<string | null>(null);
  const [state, setState] = useState<NativePlaybackState>(EMPTY);
  const stateRef = useRef(state);

  errorRef.current = onError;
  infoRef.current = onInfo;
  settingsRef.current = settings;
  stateRef.current = state;

  useEffect(() => {
    if (!enabled) return;
    const plugin = nativeEcho();
    if (!plugin) return;
    let active = true;
    const handles: Array<{ remove: () => Promise<void> | void }> = [];

    void plugin
      .addListener("stateChanged", (next) => {
        if (!active) return;
        setState(next);
        if (next.lastError && next.lastError !== lastErrorRef.current) {
          lastErrorRef.current = next.lastError;
          errorRef.current(next.lastError);
        }
        if (!next.lastError) lastErrorRef.current = "";
      })
      .then((handle) => handles.push(handle));

    void plugin
      .addListener("queueCleared", ({ count, reason }) => {
        if (!active || count <= 0) return;
        infoRef.current(
          reason === "mode-switch"
            ? `已清空 ${count} 条未完成的朗读，后续字幕将自动暂停原声。`
            : `已清空 ${count} 条朗读。`,
        );
      })
      .then((handle) => handles.push(handle));

    void plugin.getState().then((next) => {
      if (active) setState(next);
    });

    return () => {
      active = false;
      for (const handle of handles) void handle.remove();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const plugin = nativeEcho();
    if (!plugin) return;
    if (initializing) return;
    if (!audioUri) {
      lastLoadedAudioUriRef.current = null;
      void plugin.clearSession().catch(() => undefined);
      setState(EMPTY);
      return;
    }
    let current = true;
    const positionMs =
      lastLoadedAudioUriRef.current === audioUri
        ? stateRef.current.positionMs
        : startPositionMs;
    void plugin
      .loadSession({
        audioUri,
        audioName: audioName ?? "",
        cues,
        settings: nativeSettings(settingsRef.current),
        source: subtitleSource,
        startPositionMs: positionMs,
      })
      .then(() => {
        if (current) lastLoadedAudioUriRef.current = audioUri;
      })
      .catch((error: Error) => errorRef.current(error.message));
    // Settings changes are sent separately so a session is not reloaded mid-play.
    return () => {
      current = false;
    };
  }, [
    enabled,
    initializing,
    audioUri,
    audioName,
    cues,
    subtitleSource,
    startPositionMs,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const plugin = nativeEcho();
    if (!plugin) return;
    void plugin.updateSettings({ settings: nativeSettings(settingsRef.current) }).catch(() => undefined);
  }, [
    enabled,
    settings.autoPause,
    settings.offsetMs,
    settings.playbackRate,
    settings.ttsRate,
    settings.ttsPitch,
    settings.ttsVolume,
    settings.expiredPolicy,
    settings.blockedWords,
  ]);

  useEffect(() => {
    if (!enabled || !voiceName) return;
    void nativeEcho()?.setVoice({ name: voiceName }).catch(() => undefined);
  }, [enabled, voiceName]);

  const play = useCallback(() => {
    void nativeEcho()?.play().catch((error: Error) => errorRef.current(error.message));
  }, []);
  const pause = useCallback(() => {
    void nativeEcho()?.pause().catch(() => undefined);
  }, []);
  const stop = useCallback(() => {
    void nativeEcho()?.stop().catch(() => undefined);
  }, []);
  const seek = useCallback((seconds: number) => {
    void nativeEcho()
      ?.seek({ positionMs: Math.max(0, Math.round(seconds * 1000)) })
      .catch(() => undefined);
  }, []);
  const jumpToCue = useCallback(
    (index: number) => {
      const cue = cues[index];
      if (!cue) return;
      seek(cue.start + settings.offsetMs / 1000 - 0.04);
    },
    [cues, seek, settings.offsetMs],
  );
  const stepCue = useCallback(
    (direction: 1 | -1) => {
      const current = state.positionMs / 1000;
      let index: number;
      if (direction === 1) {
        index = cues.findIndex((cue) => cue.start + settings.offsetMs / 1000 > current + 0.05);
        if (index < 0) return;
      } else {
        index = cues.length - 1;
        while (index >= 0 && cues[index].start + settings.offsetMs / 1000 > current - 1) {
          index -= 1;
        }
        index = Math.max(0, index);
      }
      jumpToCue(index);
    },
    [cues, jumpToCue, settings.offsetMs, state.positionMs],
  );
  const skipSpeech = useCallback(() => {
    void nativeEcho()?.skipSpeech().catch(() => undefined);
  }, []);
  const clearSpeechQueue = useCallback(() => {
    void nativeEcho()?.clearSpeechQueue().catch(() => undefined);
  }, []);

  return {
    audioRef,
    phase: phaseFromNative(state),
    transport: state.transport,
    speechState: state.speech,
    time: state.positionMs / 1000,
    duration: state.durationMs / 1000,
    activeCue: state.activeCue,
    pointer: state.pointer,
    pendingSpeechCount: state.pendingSpeechCount,
    autoPause: state.autoPause,
    play,
    pause,
    stop,
    seek,
    jumpToCue,
    stepCue,
    skipSpeech,
    clearSpeechQueue,
    toggle: () =>
      state.transport === "playing" || (state.autoPause && state.speech === "speaking")
        ? pause()
        : play(),
  };
}
