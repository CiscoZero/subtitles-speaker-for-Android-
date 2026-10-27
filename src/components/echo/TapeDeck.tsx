import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipForward, Square } from "lucide-react";
import type { Cue } from "@/lib/subtitles";
import { formatClock } from "@/lib/format";
import type { Phase, PlayerSettings } from "@/hooks/useEchoPlayer";
import type { SpeechState } from "@/player/playbackEngine";
import { cn } from "@/lib/utils";
import { Reels } from "./Reels";
import { SeekBar } from "./SeekBar";
import { TapeIllustration } from "./TapeIllustration";
import { VuMeter } from "./VuMeter";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "待开始",
  playing: "原声播放中",
  speaking: "中文朗读中",
  paused: "已暂停",
  ended: "播放结束",
};

const PIPELINE = ["原声播放", "到点暂停", "中文朗读", "恢复原声"];

type TapeDeckProps = {
  hasAudio: boolean;
  audioName: string | null;
  phase: Phase;
  speechState: SpeechState;
  time: number;
  duration: number;
  cues: Cue[];
  activeCue: number | null;
  pointer: number;
  pendingSpeechCount: number;
  autoPause: boolean;
  settings: PlayerSettings;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onReplay: () => void;
  onPrevCue: () => void;
  onNextCue: () => void;
  onSkipSpeech: () => void;
  onStopSpeech: () => void;
  onClearSpeechQueue: () => void;
  onAutoPauseChange: (enabled: boolean) => void;
  onSeek: (seconds: number) => void;
  onRateChange: (rate: number) => void;
  onPickAudio: () => void;
};

function DeckButton({
  children,
  onClick,
  variant = "ghost",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-150 active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary"
          ? "bg-rust text-paper shadow-[0_4px_0_0_#96401C] hover:bg-[#C96633] active:shadow-[0_2px_0_0_#96401C]"
          : "border border-paper/20 bg-paper/5 text-paper/90 hover:border-paper/40 hover:bg-paper/10 hover:text-paper",
      )}
    >
      {children}
    </button>
  );
}

export function TapeDeck({
  hasAudio,
  audioName,
  phase,
  speechState,
  time,
  duration,
  cues,
  activeCue,
  pointer,
  pendingSpeechCount,
  autoPause,
  settings,
  onPlay,
  onPause,
  onStop,
  onReplay,
  onPrevCue,
  onNextCue,
  onSkipSpeech,
  onStopSpeech,
  onClearSpeechQueue,
  onAutoPauseChange,
  onSeek,
  onRateChange,
  onPickAudio,
}: TapeDeckProps) {
  const isSpeaking = speechState === "speaking";
  const speechFailed = speechState === "error";
  const isPlaying = phase === "playing";
  const sessionActive = isPlaying || (autoPause && isSpeaking);

  const activeCueObj = activeCue !== null ? cues[activeCue] : null;
  const nextCueObj = pointer < cues.length ? cues[pointer] : null;
  const displayCue = activeCueObj ?? nextCueObj;

  /** 0 = 原声播放, 2 = 中文朗读 */
  const pipelineIndex = autoPause && isSpeaking ? 2 : isPlaying ? 0 : -1;

  return (
    <section className="deck-grain relative overflow-hidden rounded-4xl bg-espresso p-4 shadow-deck sm:p-6">
      <div className="pointer-events-none absolute inset-[7px] rounded-[26px] border border-brass/25" />
      <div className="relative">
        {/* status row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  isPlaying && "bg-sage animate-lamp",
                  isSpeaking && "bg-mustard animate-lamp",
                  phase === "paused" && "bg-brass",
                  phase === "ended" && "bg-rust",
                  phase === "idle" && "bg-paper/25",
                )}
              />
              <span className="label-mono text-brass">{PHASE_LABEL[phase]}</span>
              {isSpeaking && autoPause && (
                <span className="rounded-full bg-mustard/20 px-2 py-0.5 font-mono text-[10px] tracking-widest text-mustard">
                  原声已暂停
                </span>
              )}
              {isSpeaking && !autoPause && (
                <span className="rounded-full bg-mustard/20 px-2 py-0.5 font-mono text-[10px] tracking-widest text-mustard">
                  原声连续播放中
                </span>
              )}
              {speechFailed && (
                <span className="rounded-full bg-rust/25 px-2 py-0.5 font-mono text-[10px] tracking-widest text-mustard">
                  朗读失败
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate font-mono text-[11px] text-paper/45">
              {audioName ?? "NO TAPE LOADED"}
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={autoPause}
              onClick={() => onAutoPauseChange(!autoPause)}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-2.5 py-1 font-mono text-[10px] tracking-wider text-paper/75 transition hover:border-paper/35 hover:text-paper"
            >
              <span
                className={cn(
                  "h-2 w-5 rounded-full transition-colors",
                  autoPause ? "bg-sage" : "bg-paper/25",
                )}
              />
              自动暂停 {autoPause ? "开" : "关"}
            </button>
          </div>
          <VuMeter active={isPlaying} speaking={isSpeaking} className="h-14 w-[86px]" />
        </div>

        {/* reels + current subtitle */}
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-[190px_minmax(0,1fr)]">
          <div className="flex items-center justify-center rounded-2xl border border-paper/10 bg-black/20 px-2 py-1 sm:py-2">
            <Reels spinning={isPlaying} className="w-full max-w-[190px]" />
          </div>

          {!hasAudio ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-paper px-4 py-4 text-center sm:flex-row sm:text-left">
              <TapeIllustration className="w-32 shrink-0 sm:w-40" />
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold text-espresso">先装入一张音频卡带</p>
                <p className="mt-1 text-[13px] leading-relaxed text-espresso-mute">
                  原声播到中文字幕的时间点会自动暂停，用中文朗读完这一句，再从暂停处继续原声。
                </p>
                <button
                  type="button"
                  onClick={onPickAudio}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-rust px-4 py-2 text-sm font-medium text-paper shadow-[0_4px_0_0_#96401C] transition hover:bg-[#C96633] active:translate-y-[2px] active:shadow-[0_2px_0_0_#96401C]"
                >
                  <Play className="size-4" />
                  选择音频文件
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "relative min-h-[132px] rounded-2xl border px-4 py-3.5 transition-colors",
                isSpeaking
                  ? "border-mustard/50 bg-paper-light"
                  : "border-paper/10 bg-paper-light/95",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "label-mono",
                    isSpeaking ? "text-rust" : "text-espresso-mute",
                  )}
                >
                  {isSpeaking ? "正在朗读" : displayCue ? "下一句" : "字幕已读完"}
                </span>
                {displayCue && (
                  <span className="font-mono text-[10px] tabular text-espresso-mute/70">
                    {formatClock(displayCue.start, { withHours: true })}
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "mt-1.5 font-display text-[17px] leading-relaxed sm:text-xl",
                  isSpeaking ? "text-espresso" : "text-espresso/65",
                )}
              >
                {displayCue ? displayCue.text : "等待下一条字幕…"}
              </p>
              {!autoPause && (isSpeaking || speechFailed || pendingSpeechCount > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 font-mono text-[10px] tracking-wider text-espresso-mute">
                    待播 {pendingSpeechCount} 条
                  </span>
                  <button
                    type="button"
                    onClick={onStopSpeech}
                    className="inline-flex items-center gap-1.5 rounded-full border border-espresso/20 px-2.5 py-1 font-mono text-[10px] tracking-wider text-espresso-mute transition hover:border-rust/50 hover:text-rust"
                  >
                    <SkipForward className="size-3" />
                    {speechFailed ? "跳过失败项" : "停止当前朗读"}
                  </button>
                  <button
                    type="button"
                    onClick={onClearSpeechQueue}
                    className="rounded-full border border-espresso/20 px-2.5 py-1 font-mono text-[10px] tracking-wider text-espresso-mute transition hover:border-rust/50 hover:text-rust"
                  >
                    清空队列
                  </button>
                </div>
              )}
              {autoPause && isSpeaking && (
                <button
                  type="button"
                  onClick={onSkipSpeech}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-espresso/20 px-2.5 py-1 font-mono text-[10px] tracking-wider text-espresso-mute transition hover:border-rust/50 hover:text-rust"
                >
                  <SkipForward className="size-3" />
                  跳过本句朗读
                </button>
              )}
            </div>
          )}
        </div>

        {/* timeline */}
        <div className="mt-5">
          <SeekBar
            time={time}
            duration={duration}
            marks={cues.map((cue) => Math.max(0, cue.start + settings.offsetMs / 1000))}
            disabled={!hasAudio}
            onSeek={onSeek}
          />
          <div className="mt-1 flex items-center justify-between font-mono text-[11px] tabular text-paper/60">
            <span className="text-paper">{formatClock(time, { withHours: true })}</span>
            <span className="text-paper/40">
              {cues.length ? `已读 ${Math.min(pointer, cues.length)} / ${cues.length} 句` : "无字幕"}
            </span>
            <span>{formatClock(duration, { withHours: true })}</span>
          </div>
        </div>

        {/* transport */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sessionActive ? (
            <DeckButton variant="primary" onClick={onPause}>
              <Pause className="size-4" />
              {isSpeaking && autoPause ? "暂停（打断朗读）" : "暂停"}
            </DeckButton>
          ) : (
            <DeckButton variant="primary" onClick={onPlay} disabled={!hasAudio}>
              <Play className="size-4" />
              {phase === "paused" ? "继续" : "开始"}
            </DeckButton>
          )}

          <DeckButton onClick={onStop} disabled={!hasAudio || phase === "idle"}>
            <Square className="size-3.5" />
            停止
          </DeckButton>

          <DeckButton onClick={onReplay} disabled={!hasAudio}>
            <RotateCcw className="size-3.5" />
            重播
          </DeckButton>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrevCue}
              disabled={!hasAudio || cues.length === 0}
              title="上一句（K）"
              aria-label="上一句字幕"
              className="grid size-9 place-items-center rounded-full border border-paper/20 text-paper/80 transition hover:border-paper/45 hover:text-paper active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={onNextCue}
              disabled={!hasAudio || cues.length === 0}
              title="下一句（J）"
              aria-label="下一句字幕"
              className="grid size-9 place-items-center rounded-full border border-paper/20 text-paper/80 transition hover:border-paper/45 hover:text-paper active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1 rounded-full border border-paper/15 bg-paper/5 p-1">
            <span className="label-mono px-1.5 text-brass/70">SPEED</span>
            {[0.75, 1, 1.25, 1.5].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => onRateChange(rate)}
                className={cn(
                  "rounded-full px-2 py-1 font-mono text-[11px] tabular transition-colors",
                  settings.playbackRate === rate
                    ? "bg-paper text-espresso"
                    : "text-paper/60 hover:text-paper",
                )}
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>

        {/* pipeline legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-paper/10 pt-3">
          {PIPELINE.map((step, index) => (
            <span key={step} className="flex items-center gap-2">
              {index > 0 && <span className="text-paper/25">›</span>}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider transition-colors",
                  pipelineIndex === index
                    ? "bg-rust text-paper"
                    : "text-paper/35",
                )}
              >
                {step}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
