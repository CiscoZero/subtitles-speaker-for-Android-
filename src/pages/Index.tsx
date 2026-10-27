import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { CassetteMark } from "@/components/echo/CassetteMark";
import { CueList } from "@/components/echo/CueList";
import { HelpDialog } from "@/components/echo/HelpDialog";
import { SettingsPanel } from "@/components/echo/SettingsPanel";
import { SourceSlots } from "@/components/echo/SourceSlots";
import { TapeDeck } from "@/components/echo/TapeDeck";
import { MobileEchoApp } from "@/components/mobile/MobileEchoApp";
import { useEchoPlayer, DEFAULT_SETTINGS, type PlayerSettings } from "@/hooks/useEchoPlayer";
import { useNativeEchoPlayer } from "@/hooks/useNativeEchoPlayer";
import { useSpeechVoices } from "@/hooks/useSpeechVoices";
import { formatClock, formatFileSize } from "@/lib/format";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import { decodeTextFile, parseSubtitles, type Cue, type SubtitleFormat } from "@/lib/subtitles";
import { isChineseVoice, pickDefaultVoice, speakText } from "@/lib/tts";
import {
  nativeEcho,
  nativeSettings,
  type NativeSubtitleSource,
} from "@/platform/androidNative";
import { cn } from "@/lib/utils";
import { showError, showInfo, showSuccess } from "@/utils/toast";

type AudioSource = { name: string; size: number; url: string; nativeUri?: string };
type SubtitleSource = {
  name: string;
  format: SubtitleFormat;
  encoding: string;
  warnings: string[];
};

const AUDIO_PATTERN = /\.(mp3|wav|m4a|aac|ogg|oga|flac|webm|opus)$/i;

const Index = () => {
  const initialPrefs = useMemo(loadPrefs, []);
  const [audio, setAudio] = useState<AudioSource | null>(null);
  const [subtitle, setSubtitle] = useState<SubtitleSource | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [settings, setSettings] = useState<PlayerSettings>(initialPrefs.settings ?? DEFAULT_SETTINGS);
  const [voiceURI, setVoiceURI] = useState(initialPrefs.voiceURI);
  const [parsing, setParsing] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const audioUrlRef = useRef<string | null>(null);
  const audioPickerRef = useRef<HTMLInputElement | null>(null);
  const restoredPositionRef = useRef(0);
  const androidPlugin = useMemo(() => nativeEcho(), []);
  const isAndroid = androidPlugin !== null;
  const useMobileShell = useMemo(
    () =>
      isAndroid ||
      (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mobile") === "1"),
    [isAndroid],
  );
  const [restoringSources, setRestoringSources] = useState(isAndroid);

  const { voices, supported: ttsSupported } = useSpeechVoices();
  const chineseVoices = useMemo(() => voices.filter(isChineseVoice), [voices]);
  const selectedVoice = useMemo(() => {
    if (voiceURI) {
      const found = voices.find((voice) => voice.voiceURI === voiceURI);
      if (found) return found;
    }
    return pickDefaultVoice(voices);
  }, [voiceURI, voices]);

  const webPlayer = useEchoPlayer({
    cues,
    settings,
    voice: selectedVoice,
    onError: (message) => showError(message),
    onInfo: (message) => showInfo(message),
    enabled: !isAndroid,
  });
  const subtitleSource = useMemo<NativeSubtitleSource>(
    () => ({
      name: subtitle?.name ?? "",
      format: subtitle?.format ?? "",
      encoding: subtitle?.encoding ?? "",
      warnings: subtitle?.warnings ?? [],
    }),
    [subtitle],
  );
  const nativePlayer = useNativeEchoPlayer({
    enabled: isAndroid,
    audioUri: audio?.nativeUri ?? null,
    audioName: audio?.name ?? null,
    cues,
    subtitleSource,
    settings,
    voiceName: selectedVoice?.voiceURI ?? "",
    initializing: restoringSources,
    startPositionMs: restoredPositionRef.current,
    onError: (message) => showError(message),
    onInfo: (message) => showInfo(message),
  });
  const player = isAndroid ? nativePlayer : webPlayer;

  useEffect(() => {
    if (!androidPlugin) {
      setRestoringSources(false);
      return;
    }
    let active = true;
    void androidPlugin
      .getSession()
      .then((session) => {
        if (!active || !session.hasSession || !session.audioUri) return;
        restoredPositionRef.current = session.positionMs;
        setAudio({
          name: session.audioName || "上次使用的音频",
          size: 0,
          url: "",
          nativeUri: session.audioUri,
        });
        setCues(session.cues);
        if (
          session.subtitleName &&
          (session.subtitleFormat === "vtt" ||
            session.subtitleFormat === "srt" ||
            session.subtitleFormat === "ass" ||
            session.subtitleFormat === "lrc" ||
            session.subtitleFormat === "txt")
        ) {
          setSubtitle({
            name: session.subtitleName,
            format: session.subtitleFormat,
            encoding: session.subtitleEncoding,
            warnings: session.subtitleWarnings,
          });
        } else {
          setSubtitle(null);
        }
        showInfo(
          session.positionMs > 0
            ? "已恢复上次播放位置；未完成的朗读队列已清空，原声保持暂停。"
            : "已恢复上次会话；未完成的朗读队列已清空，原声保持暂停。",
        );
      })
      .catch((error: Error) => {
        if (active) showError(`无法恢复上次会话：${error.message}`);
      })
      .finally(() => {
        if (active) setRestoringSources(false);
      });
    return () => {
      active = false;
    };
  }, [androidPlugin]);

  const handleAudioFile = (file: File) => {
    if (!AUDIO_PATTERN.test(file.name) && !file.type.startsWith("audio/")) {
      showError("请选择音频文件：MP3 / WAV / M4A / OGG / FLAC。");
      return;
    }
    player.stop();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(file);
    audioUrlRef.current = url;
    setAudio({ name: file.name, size: file.size, url });
    showSuccess(`已装入音频：${file.name}`);
  };

  const clearAudio = () => {
    player.stop();
    restoredPositionRef.current = 0;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudio(null);
  };

  const handleSubtitleFile = async (file: File) => {
    setParsing(true);
    try {
      const { text, encoding } = await decodeTextFile(file);
      const parsed = parseSubtitles(text, file.name);
      if (!parsed.cues.length) {
        showError("没有解析到任何字幕条目，请确认文件内容是否为空或格式是否正确。");
        return;
      }
      setCues(parsed.cues);
      setSubtitle({ name: file.name, format: parsed.format, encoding, warnings: parsed.warnings });
      showSuccess(`已载入 ${parsed.cues.length} 条字幕（${parsed.format.toUpperCase()} · ${encoding}）`);
    } catch (error) {
      showError(`字幕读取失败：${(error as Error).message}`);
    } finally {
      setParsing(false);
    }
  };

  const clearSubtitle = useCallback(() => {
    setCues([]);
    setSubtitle(null);
  }, []);

  const handleNativeAudio = useCallback(() => {
    if (!androidPlugin) return;
    void androidPlugin
      .pickAudio()
      .then((picked) => {
        player.stop();
        restoredPositionRef.current = 0;
        setAudio({
          name: picked.name,
          size: picked.size,
          url: "",
          nativeUri: picked.uri,
        });
        showSuccess(`已装入音频：${picked.name}`);
      })
      .catch((error: Error) => {
        if (error.message !== "未选择音频") showError(error.message);
      });
  }, [androidPlugin, player]);

  const handleNativeSubtitle = useCallback(() => {
    if (!androidPlugin) return;
    setParsing(true);
    void androidPlugin
      .pickSubtitle()
      .then((picked) => {
        const parsed = parseSubtitles(picked.content, picked.name);
        if (!parsed.cues.length) {
          showError("没有解析到任何字幕条目，请确认文件内容是否为空或格式是否正确。");
          return;
        }
        setCues(parsed.cues);
        setSubtitle({
          name: picked.name,
          format: parsed.format,
          encoding: picked.encoding,
          warnings: parsed.warnings,
        });
        showSuccess(`已载入 ${parsed.cues.length} 条字幕（${parsed.format.toUpperCase()} · ${picked.encoding}）`);
      })
      .catch((error: Error) => {
        if (error.message !== "未选择字幕") showError(`字幕读取失败：${error.message}`);
      })
      .finally(() => setParsing(false));
  }, [androidPlugin]);

  const patchSettings = useCallback((patch: Partial<PlayerSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const testVoice = useCallback(async () => {
    if (!ttsSupported) {
      showError("当前运行环境不支持语音合成，请检查系统语音引擎。");
      return;
    }
    setTestingVoice(true);
    if (androidPlugin) {
      try {
        await androidPlugin.previewVoice({
          text: "这是中文朗读测试。原声会在这句话读完之后继续播放。",
          settings: nativeSettings(settings),
        });
      } catch (error) {
        showError((error as Error).message || "朗读失败：请检查 Android 系统中文语音。");
      } finally {
        setTestingVoice(false);
      }
      return;
    }
    const result = await speakText("这是中文朗读测试。原声会在这句话读完之后继续播放。", {
      voice: selectedVoice,
      rate: settings.ttsRate,
      pitch: settings.ttsPitch,
      volume: settings.ttsVolume,
    });
    setTestingVoice(false);
    if (result === "error") {
      showError("朗读失败：请确认系统已安装中文语音（Windows 设置 → 时间和语言 → 语音）。");
    }
  }, [androidPlugin, selectedVoice, settings, ttsSupported]);

  useEffect(() => {
    savePrefs({ settings, voiceURI });
  }, [settings, voiceURI]);

  // Keyboard transport. Held in a ref so the listener never re-subscribes on every tick.
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      // Let the timeline slider handle its own arrow keys.
      if (target?.getAttribute("role") === "slider") return;

      const p = playerRef.current;
      switch (event.code) {
        case "Space":
          event.preventDefault();
          if (p.transport === "playing" || (p.autoPause && p.speechState === "speaking")) p.pause();
          else void p.play();
          break;
        case "ArrowLeft":
          event.preventDefault();
          p.seek(p.time - 5);
          break;
        case "ArrowRight":
          event.preventDefault();
          p.seek(p.time + 5);
          break;
        case "KeyJ":
          p.stepCue(1);
          break;
        case "KeyK":
          p.stepCue(-1);
          break;
        case "KeyS":
          if (p.speechState !== "idle") p.skipSpeech();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  const audioMeta = audio
    ? [player.duration > 0 ? formatClock(player.duration, { withHours: true }) : null, formatFileSize(audio.size)]
        .filter(Boolean)
        .join(" · ")
    : null;

  const subtitleMeta = subtitle ? `${cues.length} 条 · ${subtitle.format.toUpperCase()} · ${subtitle.encoding}` : null;

  const voiceChip = !ttsSupported
    ? { label: "浏览器不支持朗读", tone: "bad" as const }
    : chineseVoices.length > 0
      ? { label: "中文语音就绪", tone: "good" as const }
      : voices.length > 0
        ? { label: "缺少中文语音", tone: "warn" as const }
        : { label: "读取语音中…", tone: "warn" as const };

  if (useMobileShell) {
    return (
      <MobileEchoApp
        audioName={audio?.name ?? null}
        audioMeta={audioMeta}
        subtitleName={subtitle?.name ?? null}
        subtitleMeta={subtitleMeta}
        subtitleWarnings={subtitle?.warnings ?? []}
        cues={cues}
        settings={settings}
        voices={voices}
        voiceURI={voiceURI}
        resolvedVoice={selectedVoice}
        ttsSupported={ttsSupported}
        testingVoice={testingVoice}
        parsingSubtitle={parsing}
        phase={player.phase}
        speechState={player.speechState}
        time={player.time}
        duration={player.duration}
        activeCue={player.activeCue}
        pointer={player.pointer}
        pendingSpeechCount={player.pendingSpeechCount}
        onPickAudio={handleNativeAudio}
        onPickSubtitle={handleNativeSubtitle}
        onClearAudio={clearAudio}
        onClearSubtitle={clearSubtitle}
        onPlay={() => void player.play()}
        onPause={player.pause}
        onStop={player.stop}
        onReplay={() => player.seek(0, { autoPlay: true })}
        onPrevCue={() => player.stepCue(-1)}
        onNextCue={() => player.stepCue(1)}
        onSeek={(seconds) => player.seek(seconds)}
        onJumpCue={player.jumpToCue}
        onSkipSpeech={player.skipSpeech}
        onClearSpeechQueue={player.clearSpeechQueue}
        onSettings={patchSettings}
        onVoiceChange={setVoiceURI}
        onTestVoice={() => void testVoice()}
      />
    );
  }

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-paper grain" />

      <header className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 pb-5 pt-7 sm:px-6 sm:pt-9 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-rust text-paper shadow-[0_6px_0_-2px_#96401C]">
            <CassetteMark className="size-8" />
          </span>
          <div>
            <h1 className="font-display text-[26px] font-bold leading-none tracking-tight text-espresso sm:text-[32px]">
              译声机 <span className="text-rust">EchoTape</span>
            </h1>
            <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.28em] text-espresso-mute sm:text-[10px]">
              原声 · 中文字幕 · 朗读伴听
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
              voiceChip.tone === "good"
                ? "border-sage/35 bg-sage/10"
                : voiceChip.tone === "bad"
                  ? "border-rust/35 bg-rust/10"
                  : "border-mustard/45 bg-mustard/15",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                voiceChip.tone === "good" ? "bg-sage" : voiceChip.tone === "bad" ? "bg-rust" : "bg-mustard-deep",
              )}
            />
            <span className="label-mono text-espresso-mute">{voiceChip.label}</span>
          </div>
          <HelpDialog />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-4 pb-10 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
          <div className="animate-fade-up space-y-4">
            <SourceSlots
              audioName={audio?.name ?? null}
              audioMeta={audioMeta}
              subtitleName={subtitle?.name ?? null}
              subtitleMeta={subtitleMeta}
              parsingSubtitle={parsing}
              onAudioFile={handleAudioFile}
              onSubtitleFile={handleSubtitleFile}
              onAudioPick={isAndroid ? handleNativeAudio : undefined}
              onSubtitlePick={isAndroid ? handleNativeSubtitle : undefined}
              onClearAudio={clearAudio}
              onClearSubtitle={clearSubtitle}
            />

            <TapeDeck
              hasAudio={!!audio}
              audioName={audio?.name ?? null}
              phase={player.phase}
              speechState={player.speechState}
              time={player.time}
              duration={player.duration}
              cues={cues}
              activeCue={player.activeCue}
              pointer={player.pointer}
              pendingSpeechCount={player.pendingSpeechCount}
              autoPause={settings.autoPause}
              settings={settings}
              onPlay={() => void player.play()}
              onPause={player.pause}
              onStop={player.stop}
              onReplay={() => player.seek(0, { autoPlay: true })}
              onPrevCue={() => player.stepCue(-1)}
              onNextCue={() => player.stepCue(1)}
              onSkipSpeech={player.skipSpeech}
              onStopSpeech={player.skipSpeech}
              onClearSpeechQueue={player.clearSpeechQueue}
              onAutoPauseChange={(autoPause) => setSettings((prev) => ({ ...prev, autoPause }))}
              onSeek={(seconds) => player.seek(seconds)}
              onRateChange={(rate) => setSettings((prev) => ({ ...prev, playbackRate: rate }))}
              onPickAudio={
                isAndroid
                  ? handleNativeAudio
                  : () => audioPickerRef.current?.click()
              }
            />

            <SettingsPanel
              settings={settings}
              onSettings={patchSettings}
              voices={voices}
              voiceURI={voiceURI}
              onVoiceChange={setVoiceURI}
              resolvedVoice={selectedVoice}
              ttsSupported={ttsSupported}
              testing={testingVoice}
              onTestVoice={testVoice}
            />
          </div>

          <div className="animate-fade-up lg:sticky lg:top-5">
            <CueList
              cues={cues}
              activeCue={player.activeCue}
              pointer={player.pointer}
              fileName={subtitle?.name ?? null}
              format={subtitle?.format ?? null}
              encoding={subtitle?.encoding ?? null}
              warnings={subtitle?.warnings ?? []}
              onJump={player.jumpToCue}
              onClear={clearSubtitle}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-1.5 border-t border-espresso/10 pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-espresso-mute/80 sm:flex-row sm:items-center sm:justify-between">
          <span>全部处理在本机完成 · 音频与字幕不会上传</span>
          <span>空格 开始/暂停 · ← → 前后 5 秒 · J K 下/上一句 · 点击字幕可重听</span>
        </div>
      </main>

      {!isAndroid && (
        <audio ref={player.audioRef} src={audio?.url || undefined} preload="metadata" className="hidden" />
      )}
      <input
        ref={audioPickerRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.webm"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleAudioFile(file);
          event.target.value = "";
        }}
      />
      <MadeWithDyad />
    </div>
  );
};

export default Index;
