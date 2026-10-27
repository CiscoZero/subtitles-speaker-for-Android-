import { useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileAudio,
  Gauge,
  Headphones,
  Layers3,
  ListMusic,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  SlidersHorizontal,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { CassetteMark } from "@/components/echo/CassetteMark";
import { SeekBar } from "@/components/echo/SeekBar";
import type { Phase, PlayerSettings } from "@/hooks/useEchoPlayer";
import { formatClock, formatOffset } from "@/lib/format";
import type { Cue } from "@/lib/subtitles";
import type { SpeechState } from "@/player/playbackEngine";
import { cn } from "@/lib/utils";

type MobileTab = "player" | "cues" | "settings";

type MobileEchoAppProps = {
  audioName: string | null;
  audioMeta: string | null;
  subtitleName: string | null;
  subtitleMeta: string | null;
  subtitleWarnings: string[];
  cues: Cue[];
  settings: PlayerSettings;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  resolvedVoice: SpeechSynthesisVoice | null;
  ttsSupported: boolean;
  testingVoice: boolean;
  parsingSubtitle: boolean;
  phase: Phase;
  speechState: SpeechState;
  time: number;
  duration: number;
  activeCue: number | null;
  pointer: number;
  pendingSpeechCount: number;
  onPickAudio: () => void;
  onPickSubtitle: () => void;
  onClearAudio: () => void;
  onClearSubtitle: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onReplay: () => void;
  onPrevCue: () => void;
  onNextCue: () => void;
  onSeek: (seconds: number) => void;
  onJumpCue: (index: number) => void;
  onSkipSpeech: () => void;
  onClearSpeechQueue: () => void;
  onSettings: (patch: Partial<PlayerSettings>) => void;
  onVoiceChange: (uri: string) => void;
  onTestVoice: () => void;
};

const TAB_ITEMS: Array<{ id: MobileTab; label: string; icon: typeof Play }> = [
  { id: "player", label: "播放", icon: Headphones },
  { id: "cues", label: "字幕", icon: Captions },
  { id: "settings", label: "设置", icon: Settings2 },
];

const PHASE_LABEL: Record<Phase, string> = {
  idle: "等待开始",
  playing: "原声播放中",
  speaking: "中文朗读中",
  paused: "已暂停",
  ended: "播放结束",
};

function IconButton({
  label,
  children,
  onClick,
  disabled,
  className,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-11 place-items-center rounded-full text-espresso transition active:scale-95 disabled:opacity-35",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SourceCard({
  kind,
  fileName,
  meta,
  loading,
  onPick,
  onClear,
}: {
  kind: "audio" | "subtitle";
  fileName: string | null;
  meta: string | null;
  loading?: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  const isAudio = kind === "audio";
  const Icon = isAudio ? FileAudio : Captions;
  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-espresso/10 bg-paper-light p-3.5 shadow-[0_10px_30px_-24px_rgba(46,33,28,0.7)]">
      <div
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-2xl",
          fileName ? "bg-rust text-paper" : "bg-espresso/5 text-espresso-mute",
        )}
      >
        {loading ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
      </div>
      <button type="button" onClick={onPick} className="min-w-0 flex-1 text-left">
        <span className="block text-[11px] font-semibold tracking-[0.16em] text-espresso-mute">
          {isAudio ? "外语音频" : "中文字幕"}
        </span>
        <span className={cn("mt-0.5 block truncate text-[15px] font-semibold", fileName ? "text-espresso" : "text-espresso-mute")}>
          {fileName ?? (isAudio ? "选择 MP3、M4A、WAV…" : "选择 VTT、SRT、ASS…")}
        </span>
        {meta && <span className="mt-1 block truncate text-[11px] text-espresso-mute">{meta}</span>}
      </button>
      {fileName ? (
        <IconButton label={isAudio ? "移除音频" : "移除字幕"} onClick={onClear} className="size-9 bg-espresso/5">
          <X className="size-4" />
        </IconButton>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="shrink-0 rounded-full bg-espresso px-3.5 py-2 text-[12px] font-semibold text-paper active:scale-95"
        >
          选择
        </button>
      )}
    </div>
  );
}

function RangeField({
  icon,
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-[20px] border border-espresso/10 bg-paper-light p-3.5">
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-espresso">
          <span className="text-rust">{icon}</span>
          {label}
        </span>
        <span className="rounded-full bg-espresso/5 px-2 py-0.5 font-mono text-[11px] text-espresso-mute">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-9 w-full accent-rust"
      />
    </label>
  );
}

function ToggleRow({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="flex w-full items-center justify-between gap-4 rounded-[22px] border border-espresso/10 bg-paper-light p-4 text-left"
    >
      <span>
        <span className="block text-[15px] font-semibold text-espresso">字幕到达时暂停原声</span>
        <span className="mt-1 block text-[12px] leading-relaxed text-espresso-mute">
          {enabled ? "朗读结束后，从精确暂停位置继续原声" : "原声连续播放，中文朗读按顺序排队"}
        </span>
      </span>
      <span
        className={cn(
          "relative h-8 w-[52px] shrink-0 rounded-full transition-colors",
          enabled ? "bg-rust" : "bg-espresso/20",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-6 rounded-full bg-paper-light shadow transition-transform",
            enabled ? "translate-x-[22px]" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}

export function MobileEchoApp({
  audioName,
  audioMeta,
  subtitleName,
  subtitleMeta,
  subtitleWarnings,
  cues,
  settings,
  voices,
  voiceURI,
  resolvedVoice,
  ttsSupported,
  testingVoice,
  parsingSubtitle,
  phase,
  speechState,
  time,
  duration,
  activeCue,
  pointer,
  pendingSpeechCount,
  onPickAudio,
  onPickSubtitle,
  onClearAudio,
  onClearSubtitle,
  onPlay,
  onPause,
  onStop,
  onReplay,
  onPrevCue,
  onNextCue,
  onSeek,
  onJumpCue,
  onSkipSpeech,
  onClearSpeechQueue,
  onSettings,
  onVoiceChange,
  onTestVoice,
}: MobileEchoAppProps) {
  const [tab, setTab] = useState<MobileTab>("player");
  const [query, setQuery] = useState("");
  const activeRowRef = useRef<HTMLButtonElement | null>(null);

  const isPlaying = phase === "playing";
  const isSpeaking = speechState === "speaking";
  const activeCueData = activeCue !== null ? cues[activeCue] : null;
  const upcomingCue = pointer < cues.length ? cues[pointer] : null;
  const displayCue = activeCueData ?? upcomingCue;
  const chineseVoices = voices.filter(
    (voice) => /^zh\b|^zh[-_]/i.test(voice.lang) || /chinese|中文|普通话|國語|国语|mandarin/i.test(voice.name),
  );

  const filteredCues = useMemo(() => {
    const keyword = query.trim();
    return cues
      .map((cue, index) => ({ cue, index }))
      .filter(({ cue }) => !keyword || cue.text.includes(keyword));
  }, [cues, query]);

  useEffect(() => {
    if (tab !== "cues") return;
    activeRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeCue, pointer, tab]);

  const togglePlayback = () => {
    if (isPlaying || (settings.autoPause && isSpeaking)) onPause();
    else onPlay();
  };

  const minuteStep = (delta: number) => {
    onSettings({ offsetMs: Math.max(-10000, Math.min(10000, settings.offsetMs + delta)) });
  };

  return (
    <div className="min-h-[100dvh] bg-[#efe2cc] text-espresso">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,248,232,0.95),transparent_34%),radial-gradient(circle_at_100%_25%,rgba(191,91,46,0.12),transparent_30%)]" />

      <header
        className="sticky top-0 z-30 border-b border-espresso/10 bg-[#f3e7d3]/92 px-4 pb-3 backdrop-blur-xl"
        style={{ paddingTop: "max(0.85rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-2xl bg-rust text-paper shadow-[0_5px_0_-2px_#8E3A1B]">
              <CassetteMark className="size-7" />
            </span>
            <div>
              <h1 className="text-[20px] font-black leading-none tracking-tight">译声机</h1>
              <p className="mt-1 text-[9px] font-semibold tracking-[0.2em] text-espresso-mute">ECHOTAPE MOBILE</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTab("settings")}
            className="flex items-center gap-2 rounded-full border border-espresso/10 bg-paper-light px-3 py-2 text-[11px] font-semibold text-espresso-mute active:scale-95"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                ttsSupported && chineseVoices.length > 0 ? "bg-sage" : "bg-mustard",
              )}
            />
            {ttsSupported && chineseVoices.length > 0 ? "中文语音就绪" : "检查语音"}
            <SlidersHorizontal className="size-3.5" />
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-xl px-4 pb-44 pt-4">
        {tab === "player" && (
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-[30px] bg-espresso p-5 text-paper shadow-[0_24px_55px_-28px_rgba(46,33,28,0.95)]">
              <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-rust/25 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-28 -left-20 size-56 rounded-full bg-mustard/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[9px] font-bold tracking-[0.24em] text-brass">NOW PLAYING</span>
                    <h2 className="mt-1 truncate text-[17px] font-bold text-paper">
                      {audioName ?? "还没有装入音频"}
                    </h2>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold",
                      isPlaying && "bg-sage/25 text-[#d5efe3]",
                      isSpeaking && "bg-mustard/20 text-[#f4d58c]",
                      !isPlaying && !isSpeaking && "bg-paper/10 text-paper/60",
                    )}
                  >
                    {PHASE_LABEL[phase]}
                  </span>
                </div>

                <div className="mt-5 min-h-[74px]">
                  {!audioName ? (
                    <div className="flex items-center gap-3 rounded-2xl bg-paper/8 p-3">
                      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-paper/10">
                        <FileAudio className="size-5 text-brass" />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold">先装入外语音频</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-paper/50">
                          再选择独立的中文字幕文件
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="line-clamp-2 text-[17px] font-semibold leading-relaxed text-paper">
                        {displayCue?.text ?? "等待播放到下一句字幕…"}
                      </p>
                      <p className="mt-1.5 text-[10px] font-semibold tracking-[0.14em] text-paper/40">
                        {displayCue
                          ? `${isSpeaking ? "正在朗读" : "下一句"} · ${formatClock(displayCue.start, { withHours: true })}`
                          : "SUBTITLE CUE"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <SeekBar
                    time={time}
                    duration={duration}
                    marks={cues.map((cue) => cue.start)}
                    disabled={!audioName}
                    onSeek={onSeek}
                  />
                  <div className="flex justify-between font-mono text-[10px] tabular text-paper/45">
                    <span>{formatClock(time)}</span>
                    <span>{duration > 0 ? formatClock(duration) : "--:--"}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-center gap-7">
                  <IconButton
                    label="上一条字幕"
                    onClick={onPrevCue}
                    disabled={!audioName || cues.length === 0}
                    className="bg-paper/8 text-paper active:bg-paper/15"
                  >
                    <ChevronLeft className="size-6" />
                  </IconButton>
                  <button
                    type="button"
                    aria-label={isPlaying || (settings.autoPause && isSpeaking) ? "暂停" : "播放"}
                    onClick={audioName ? togglePlayback : onPickAudio}
                    className="grid size-[76px] place-items-center rounded-full bg-rust text-paper shadow-[0_8px_0_-2px_#8E3A1B,0_16px_30px_-12px_rgba(191,91,46,0.8)] active:translate-y-1 active:shadow-[0_5px_0_-2px_#8E3A1B]"
                  >
                    {isPlaying || (settings.autoPause && isSpeaking) ? (
                      <Pause className="size-8 fill-current" />
                    ) : (
                      <Play className="ml-1 size-8 fill-current" />
                    )}
                  </button>
                  <IconButton
                    label="下一条字幕"
                    onClick={onNextCue}
                    disabled={!audioName || cues.length === 0}
                    className="bg-paper/8 text-paper active:bg-paper/15"
                  >
                    <ChevronRight className="size-6" />
                  </IconButton>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-paper/10 pt-3">
                  <button
                    type="button"
                    onClick={onReplay}
                    disabled={!audioName}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[11px] font-semibold text-paper/65 active:bg-paper/10 disabled:opacity-35"
                  >
                    <RotateCcw className="size-4" />
                    重播
                  </button>
                  <button
                    type="button"
                    onClick={onStop}
                    disabled={!audioName}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[11px] font-semibold text-paper/65 active:bg-paper/10 disabled:opacity-35"
                  >
                    <Square className="size-3.5 fill-current" />
                    停止
                  </button>
                  <button
                    type="button"
                    onClick={() => onSettings({ autoPause: !settings.autoPause })}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[11px] font-semibold text-paper/65 active:bg-paper/10"
                  >
                    <Clock3 className="size-4" />
                    {settings.autoPause ? "自动暂停" : "连续播放"}
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[13px] font-bold text-espresso">播放素材</h3>
                <span className="text-[10px] font-semibold tracking-[0.12em] text-espresso-mute">两个文件可分别选择</span>
              </div>
              <SourceCard
                kind="audio"
                fileName={audioName}
                meta={audioMeta}
                onPick={onPickAudio}
                onClear={onClearAudio}
              />
              <SourceCard
                kind="subtitle"
                fileName={subtitleName}
                meta={subtitleMeta}
                loading={parsingSubtitle}
                onPick={onPickSubtitle}
                onClear={onClearSubtitle}
              />
            </section>

            {!settings.autoPause && (isSpeaking || pendingSpeechCount > 0 || speechState === "error") && (
              <section className="rounded-[22px] border border-mustard/25 bg-[#fff4d8] p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-mustard/20 text-[#8b641e]">
                    <ListMusic className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-espresso">中文朗读队列</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-espresso-mute">
                      原声仍在连续播放，待播 {pendingSpeechCount} 条。
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={onSkipSpeech}
                        className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-espresso px-3 text-[11px] font-semibold text-paper"
                      >
                        <SkipForward className="size-3.5" />
                        {speechState === "error" ? "跳过失败项" : "停止当前朗读"}
                      </button>
                      <button
                        type="button"
                        onClick={onClearSpeechQueue}
                        className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-espresso/15 bg-paper-light px-3 text-[11px] font-semibold text-espresso"
                      >
                        <Trash2 className="size-3.5" />
                        清空队列
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {settings.autoPause && isSpeaking && (
              <button
                type="button"
                onClick={onSkipSpeech}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-espresso/10 bg-paper-light text-[12px] font-semibold text-espresso-mute active:bg-paper"
              >
                <SkipForward className="size-4" />
                跳过本句朗读并继续原声
              </button>
            )}
          </div>
        )}

        {tab === "cues" && (
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <h2 className="text-[25px] font-black tracking-tight text-espresso">字幕流</h2>
                <p className="mt-1 text-[12px] text-espresso-mute">点击任意一句，跳到该时间点</p>
              </div>
              <button
                type="button"
                onClick={onPickSubtitle}
                className="rounded-full bg-espresso px-3.5 py-2 text-[11px] font-semibold text-paper active:scale-95"
              >
                {subtitleName ? "更换" : "选择字幕"}
              </button>
            </div>

            {!subtitleName ? (
              <section className="rounded-[26px] border border-dashed border-espresso/20 bg-paper-light/70 px-6 py-12 text-center">
                <Captions className="mx-auto size-9 text-rust" />
                <h3 className="mt-4 text-[17px] font-bold">还没有字幕文件</h3>
                <p className="mx-auto mt-2 max-w-[280px] text-[12px] leading-relaxed text-espresso-mute">
                  支持 VTT、SRT、ASS/SSA、LRC 和 TXT。字幕与音频文件名不需要一致。
                </p>
                <button
                  type="button"
                  onClick={onPickSubtitle}
                  className="mt-5 rounded-full bg-rust px-5 py-2.5 text-[13px] font-semibold text-paper"
                >
                  选择字幕文件
                </button>
              </section>
            ) : (
              <>
                <section className="rounded-[22px] border border-espresso/10 bg-paper-light p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-rust/10 text-rust">
                      <Captions className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{subtitleName}</p>
                      <p className="mt-0.5 text-[11px] text-espresso-mute">{subtitleMeta}</p>
                    </div>
                    <IconButton label="移除字幕" onClick={onClearSubtitle} className="size-9 bg-espresso/5">
                      <X className="size-4" />
                    </IconButton>
                  </div>
                </section>

                {subtitleWarnings.length > 0 && (
                  <div className="rounded-[18px] bg-mustard/15 px-3.5 py-3 text-[11px] leading-relaxed text-[#75521c]">
                    {subtitleWarnings.slice(0, 2).join(" ")}
                  </div>
                )}

                {displayCue && (
                  <section className="rounded-[22px] bg-espresso px-4 py-4 text-paper">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold tracking-[0.2em] text-brass">
                        {isSpeaking ? "正在朗读" : "当前字幕"}
                      </span>
                      <span className="font-mono text-[10px] text-paper/45">
                        {formatClock(displayCue.start, { withHours: true })}
                      </span>
                    </div>
                    <p className="mt-2 text-[16px] font-semibold leading-relaxed">{displayCue.text}</p>
                  </section>
                )}

                <div className="relative">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索字幕文本"
                    className="h-12 w-full rounded-2xl border border-espresso/10 bg-paper-light pl-4 pr-10 text-[14px] outline-none placeholder:text-espresso-mute/60 focus:border-rust/40"
                  />
                  {query ? (
                    <button
                      type="button"
                      aria-label="清除搜索"
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-espresso-mute"
                    >
                      <X className="size-4" />
                    </button>
                  ) : (
                    <Layers3 className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-espresso-mute/50" />
                  )}
                </div>

                <div className="space-y-1.5">
                  {filteredCues.map(({ cue, index }) => {
                    const active = activeCue === index;
                    const currentPosition = index === pointer;
                    const passed = index < pointer;
                    return (
                      <button
                        key={cue.id}
                        type="button"
                        onClick={() => onJumpCue(index)}
                        ref={active || (!activeCueData && currentPosition) ? activeRowRef : undefined}
                        className={cn(
                          "flex w-full gap-3 rounded-[18px] border px-3.5 py-3 text-left transition",
                          active
                            ? "border-rust bg-rust text-paper shadow-[0_10px_25px_-18px_rgba(191,91,46,1)]"
                            : currentPosition
                              ? "border-rust/25 bg-[#fff8ec]"
                              : "border-transparent bg-paper-light/65",
                          passed && !active && "opacity-50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 w-6 shrink-0 text-center font-mono text-[10px] font-bold",
                            active ? "text-paper/65" : "text-rust/70",
                          )}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block font-mono text-[9px] tracking-wider",
                              active ? "text-paper/55" : "text-espresso-mute",
                            )}
                          >
                            {formatClock(cue.start, { withHours: true })}
                            {currentPosition && !active ? " · 下一句" : ""}
                          </span>
                          <span className="mt-1 block text-[14px] font-medium leading-relaxed">{cue.text}</span>
                        </span>
                      </button>
                    );
                  })}
                  {filteredCues.length === 0 && (
                    <p className="py-10 text-center text-[12px] text-espresso-mute">没有匹配的字幕</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-5">
            <div className="px-1">
              <h2 className="text-[25px] font-black tracking-tight">播放设置</h2>
              <p className="mt-1 text-[12px] text-espresso-mute">修改后立即生效并保存在本机</p>
            </div>

            <section className="space-y-2.5">
              <h3 className="px-1 text-[12px] font-bold tracking-[0.12em] text-espresso-mute">跟读模式</h3>
              <ToggleRow enabled={settings.autoPause} onChange={(autoPause) => onSettings({ autoPause })} />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSettings({ autoPause: true })}
                  className={cn(
                    "rounded-[18px] border p-3 text-left",
                    settings.autoPause ? "border-rust bg-rust/10" : "border-espresso/10 bg-paper-light",
                  )}
                >
                  <span className="block text-[13px] font-bold">模式 A</span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-espresso-mute">暂停原声，朗读后继续</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSettings({ autoPause: false })}
                  className={cn(
                    "rounded-[18px] border p-3 text-left",
                    !settings.autoPause ? "border-rust bg-rust/10" : "border-espresso/10 bg-paper-light",
                  )}
                >
                  <span className="block text-[13px] font-bold">模式 B</span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-espresso-mute">原声连续，朗读排队</span>
                </button>
              </div>
            </section>

            <section className="space-y-2.5">
              <h3 className="px-1 text-[12px] font-bold tracking-[0.12em] text-espresso-mute">中文朗读</h3>
              <div className="rounded-[22px] border border-espresso/10 bg-paper-light p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-bold">系统语音</p>
                    <p className="mt-1 text-[11px] text-espresso-mute">
                      {ttsSupported ? resolvedVoice?.name ?? "自动选择中文语音" : "当前环境不支持系统 TTS"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onTestVoice}
                    disabled={!ttsSupported || testingVoice}
                    className="flex min-h-10 items-center gap-1.5 rounded-full bg-espresso px-3 text-[11px] font-semibold text-paper disabled:opacity-40"
                  >
                    {testingVoice ? <Loader2 className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
                    试听
                  </button>
                </div>
                <div className="relative mt-3">
                  <select
                    value={voices.some((voice) => voice.voiceURI === voiceURI) ? voiceURI : ""}
                    onChange={(event) => onVoiceChange(event.target.value)}
                    className="h-12 w-full appearance-none rounded-2xl border border-espresso/10 bg-[#f7eedf] px-3 pr-9 text-[13px] text-espresso outline-none focus:border-rust/40"
                  >
                    <option value="">自动选择（优先中文语音）</option>
                    {voices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name}
                        {voice.lang ? ` · ${voice.lang}` : ""}
                        {voice.localService ? "" : " · 在线"}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-espresso-mute" />
                </div>
              </div>

              <RangeField
                icon={<Gauge className="size-4" />}
                label="朗读语速"
                display={`${settings.ttsRate.toFixed(2)}×`}
                value={settings.ttsRate}
                min={0.5}
                max={1.8}
                step={0.05}
                onChange={(ttsRate) => onSettings({ ttsRate })}
              />
              <RangeField
                icon={<Volume2 className="size-4" />}
                label="朗读音量"
                display={`${Math.round(settings.ttsVolume * 100)}%`}
                value={settings.ttsVolume}
                min={0}
                max={1}
                step={0.05}
                onChange={(ttsVolume) => onSettings({ ttsVolume })}
              />
              <RangeField
                icon={<SlidersHorizontal className="size-4" />}
                label="朗读音高"
                display={settings.ttsPitch.toFixed(2)}
                value={settings.ttsPitch}
                min={0.6}
                max={1.5}
                step={0.05}
                onChange={(ttsPitch) => onSettings({ ttsPitch })}
              />
            </section>

            <section className="space-y-2.5">
              <h3 className="px-1 text-[12px] font-bold tracking-[0.12em] text-espresso-mute">原声与同步</h3>
              <RangeField
                icon={<Gauge className="size-4" />}
                label="原声速度"
                display={`${settings.playbackRate.toFixed(2)}×`}
                value={settings.playbackRate}
                min={0.5}
                max={2}
                step={0.05}
                onChange={(playbackRate) => onSettings({ playbackRate })}
              />
              <div className="rounded-[20px] border border-espresso/10 bg-paper-light p-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <Clock3 className="size-4 text-rust" />
                    字幕偏移
                  </span>
                  <span className="font-mono text-[12px] font-bold text-rust">{formatOffset(settings.offsetMs)}</span>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  <button type="button" onClick={() => minuteStep(-500)} className="h-10 rounded-xl bg-espresso/5 text-[11px] font-bold">−0.5s</button>
                  <button type="button" onClick={() => minuteStep(-100)} className="h-10 rounded-xl bg-espresso/5 text-[11px] font-bold">−0.1s</button>
                  <button type="button" onClick={() => onSettings({ offsetMs: 0 })} className="h-10 rounded-xl bg-espresso text-[11px] font-bold text-paper">归零</button>
                  <button type="button" onClick={() => minuteStep(100)} className="h-10 rounded-xl bg-espresso/5 text-[11px] font-bold">+0.1s</button>
                  <button type="button" onClick={() => minuteStep(500)} className="h-10 rounded-xl bg-espresso/5 text-[11px] font-bold">+0.5s</button>
                </div>
              </div>
              <div className="rounded-[20px] border border-espresso/10 bg-paper-light p-3.5">
                <p className="text-[14px] font-semibold">过期字幕</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSettings({ expiredPolicy: "read-all" })}
                    className={cn(
                      "min-h-12 rounded-xl border px-2 text-[11px] font-semibold",
                      settings.expiredPolicy === "read-all"
                        ? "border-rust bg-rust/10 text-rust"
                        : "border-espresso/10 text-espresso-mute",
                    )}
                  >
                    逐条补读
                  </button>
                  <button
                    type="button"
                    onClick={() => onSettings({ expiredPolicy: "skip" })}
                    className={cn(
                      "min-h-12 rounded-xl border px-2 text-[11px] font-semibold",
                      settings.expiredPolicy === "skip"
                        ? "border-rust bg-rust/10 text-rust"
                        : "border-espresso/10 text-espresso-mute",
                    )}
                  >
                    跳到当前进度
                  </button>
                </div>
              </div>
            </section>

            <div className="rounded-[20px] bg-espresso/[0.05] px-4 py-3 text-[11px] leading-relaxed text-espresso-mute">
              音频、字幕和系统 TTS 均在本机处理。应用不会上传你的文件或朗读内容。
            </div>
          </div>
        )}
      </main>

      {tab !== "player" && (
        <div
          className="fixed inset-x-0 z-30 mx-auto max-w-xl px-3"
          style={{ bottom: "calc(68px + env(safe-area-inset-bottom))" }}
        >
          <div className="relative overflow-hidden rounded-[20px] border border-espresso/15 bg-[#fff8ec]/95 p-2.5 shadow-[0_10px_35px_-14px_rgba(46,33,28,0.7)] backdrop-blur-xl">
            <div
              className="absolute bottom-0 left-0 h-0.5 bg-rust transition-[width]"
              style={{ width: `${duration > 0 ? Math.min(100, (time / duration) * 100) : 0}%` }}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={isPlaying ? "暂停" : "播放"}
                onClick={togglePlayback}
                disabled={!audioName}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-rust text-paper disabled:opacity-35"
              >
                {isPlaying || (settings.autoPause && isSpeaking) ? (
                  <Pause className="size-5 fill-current" />
                ) : (
                  <Play className="ml-0.5 size-5 fill-current" />
                )}
              </button>
              <button type="button" onClick={() => setTab("player")} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[13px] font-bold">{audioName ?? "未装入音频"}</p>
                <p className="mt-0.5 truncate text-[10px] text-espresso-mute">
                  {displayCue?.text ?? PHASE_LABEL[phase]}
                </p>
              </button>
              <span className="shrink-0 font-mono text-[10px] text-espresso-mute">{formatClock(time)}</span>
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-espresso/10 bg-[#f7eddc]/96 px-4 pt-1.5 backdrop-blur-xl"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto grid max-w-sm grid-cols-3">
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-bold tracking-[0.08em] transition",
                  active ? "text-rust" : "text-espresso-mute",
                )}
              >
                <span className={cn("grid size-8 place-items-center rounded-xl", active && "bg-rust/10")}>
                  <Icon className={cn("size-[20px]", active && "stroke-[2.5]")} />
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
