import { memo, useState } from "react";
import { Loader2, PlugZap, Volume2, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatOffset } from "@/lib/format";
import { isChineseVoice } from "@/lib/tts";
import type { PlayerSettings } from "@/hooks/useEchoPlayer";
import { cn } from "@/lib/utils";

type SettingsPanelProps = {
  settings: PlayerSettings;
  onSettings: (patch: Partial<PlayerSettings>) => void;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  onVoiceChange: (uri: string) => void;
  resolvedVoice: SpeechSynthesisVoice | null;
  ttsSupported: boolean;
  testing: boolean;
  onTestVoice: () => void;
};

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-espresso/80">{label}</span>
        <span className="font-mono text-[11px] tabular text-rust">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(next[0])}
        className="mt-1.5 py-1"
        aria-label={label}
      />
    </div>
  );
}

function StepButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-espresso/20 bg-paper px-2 py-1 font-mono text-[10px] tabular text-espresso transition hover:border-rust/60 hover:text-rust active:translate-y-px"
    >
      {children}
    </button>
  );
}

export const SettingsPanel = memo(function SettingsPanel({
  settings,
  onSettings,
  voices,
  voiceURI,
  onVoiceChange,
  resolvedVoice,
  ttsSupported,
  testing,
  onTestVoice,
}: SettingsPanelProps) {
  const [blockedDraft, setBlockedDraft] = useState("");
  const chineseVoices = voices.filter(isChineseVoice);
  // A remembered voice may not be loaded yet — show "auto" instead of a blank select.
  const selectValue = voices.some((voice) => voice.voiceURI === voiceURI) ? voiceURI : "";
  const nudgeOffset = (delta: number) => {
    const next = Math.min(10000, Math.max(-10000, settings.offsetMs + delta));
    onSettings({ offsetMs: next });
  };
  const addBlockedWords = () => {
    const additions = blockedDraft
      .split(/[,，\n]/)
      .map((word) => word.trim())
      .filter(Boolean);
    if (!additions.length) return;
    const next = [...settings.blockedWords];
    for (const word of additions) {
      if (!next.some((value) => value.toLowerCase() === word.toLowerCase())) next.push(word);
    }
    onSettings({ blockedWords: next.slice(0, 200) });
    setBlockedDraft("");
  };
  const removeBlockedWord = (word: string) => {
    onSettings({ blockedWords: settings.blockedWords.filter((value) => value !== word) });
  };

  return (
    <section className="rounded-3xl border border-espresso/10 bg-paper-light/85 p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-espresso">朗读与同步</h2>
        <span className="label-mono text-espresso-mute">settings</span>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 rounded-xl border border-espresso/10 bg-paper px-3 py-2.5">
        <div>
          <p className="text-[12px] font-medium text-espresso/80">字幕到达时自动暂停原声</p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-espresso-mute">
            {settings.autoPause ? "开启：先朗读，再从暂停位置继续" : "关闭：原声连续播放，朗读按队列进行"}
          </p>
        </div>
        <Switch
          checked={settings.autoPause}
          onCheckedChange={(checked) => onSettings({ autoPause: checked })}
          aria-label="自动暂停原声"
        />
      </div>

      <div className="mt-3.5 rounded-xl border border-espresso/10 bg-paper px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium text-espresso/80">屏蔽词</p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-espresso-mute">
              字幕包含任一屏蔽词时跳过朗读，原声继续播放
            </p>
          </div>
          <span className="font-mono text-[10px] text-espresso-mute">{settings.blockedWords.length} 个</span>
        </div>
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            addBlockedWords();
          }}
        >
          <input
            value={blockedDraft}
            onChange={(event) => setBlockedDraft(event.target.value)}
            placeholder="输入屏蔽词或短语，可用逗号分隔"
            className="min-w-0 flex-1 rounded-lg border border-espresso/15 bg-paper-light px-2.5 py-1.5 text-[12px] text-espresso placeholder:text-espresso-mute/60 focus:border-rust/60 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-espresso px-3 py-1.5 text-[11px] font-medium text-paper"
          >
            添加
          </button>
        </form>
        {settings.blockedWords.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {settings.blockedWords.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => removeBlockedWord(word)}
                className="inline-flex items-center gap-1 rounded-full bg-espresso/[0.07] px-2 py-1 text-[10.5px] text-espresso-mute hover:bg-rust/10 hover:text-rust"
                aria-label={`移除屏蔽词 ${word}`}
              >
                {word}
                <X className="size-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* voice */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-espresso/80">中文语音</span>
          <button
            type="button"
            onClick={onTestVoice}
            disabled={testing || !ttsSupported}
            className="inline-flex items-center gap-1.5 rounded-full border border-espresso/20 px-2.5 py-1 text-[11px] font-medium text-espresso transition hover:border-rust/60 hover:text-rust disabled:opacity-40"
          >
            {testing ? <Loader2 className="size-3 animate-spin" /> : <Volume2 className="size-3" />}
            试听
          </button>
        </div>
        <div className="relative mt-1.5">
          <select
            value={selectValue}
            onChange={(event) => onVoiceChange(event.target.value)}
            className="w-full appearance-none rounded-xl border border-espresso/20 bg-paper px-3 py-2 pr-8 text-[12.5px] text-espresso focus:border-rust/60 focus:outline-none focus:ring-2 focus:ring-rust/20"
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
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-espresso-mute">
            ▼
          </span>
        </div>

        {!ttsSupported ? (
          <p className="mt-2 flex gap-1.5 rounded-xl bg-rust/10 px-2.5 py-2 text-[11px] leading-snug text-rust-deep">
            <PlugZap className="mt-0.5 size-3 shrink-0" />
            当前运行环境不支持语音合成。请检查系统语音引擎或使用支持的浏览器。
          </p>
        ) : voices.length === 0 ? (
          <p className="mt-2 rounded-xl bg-mustard/15 px-2.5 py-2 text-[11px] leading-snug text-[#7A5518]">
            正在读取系统语音…若长时间为空，请在系统设置中安装中文语音包。
          </p>
        ) : chineseVoices.length === 0 ? (
          <p className="mt-2 rounded-xl bg-mustard/15 px-2.5 py-2 text-[11px] leading-snug text-[#7A5518]">
            未检测到中文语音，将用「{resolvedVoice?.name ?? "—"}」朗读。建议在系统设置中安装「中文（简体）」语音包以获得自然中文。
          </p>
        ) : (
          <p className="mt-2 font-mono text-[10px] tracking-wide text-espresso-mute/80">
            使用：{resolvedVoice?.name ?? "—"}
            {resolvedVoice?.localService ? " · 本机离线" : " · 在线语音"}
          </p>
        )}
      </div>

      <div className="my-4 h-px bg-espresso/10" />

      {/* tts params */}
      <div className="space-y-3">
        <SliderRow
          label="语速"
          value={settings.ttsRate}
          display={`${settings.ttsRate.toFixed(2)}×`}
          min={0.5}
          max={1.8}
          step={0.05}
          onChange={(value) => onSettings({ ttsRate: value })}
        />
        <SliderRow
          label="音量"
          value={settings.ttsVolume}
          display={`${Math.round(settings.ttsVolume * 100)}%`}
          min={0}
          max={1}
          step={0.05}
          onChange={(value) => onSettings({ ttsVolume: value })}
        />
        <SliderRow
          label="音高"
          value={settings.ttsPitch}
          display={settings.ttsPitch.toFixed(2)}
          min={0.6}
          max={1.5}
          step={0.05}
          onChange={(value) => onSettings({ ttsPitch: value })}
        />
      </div>

      <div className="my-4 h-px bg-espresso/10" />

      {/* offset */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-espresso/80">字幕时间偏移</span>
          <button
            type="button"
            onClick={() => onSettings({ offsetMs: 0 })}
            className="font-mono text-[10px] tracking-wider text-espresso-mute underline decoration-dotted underline-offset-2 hover:text-rust"
          >
            归零
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <StepButton onClick={() => nudgeOffset(-500)}>−0.5</StepButton>
          <StepButton onClick={() => nudgeOffset(-100)}>−0.1</StepButton>
          <div className="min-w-[70px] flex-1 rounded-lg bg-espresso px-2 py-1 text-center font-mono text-[11px] tabular text-paper">
            {formatOffset(settings.offsetMs)}
          </div>
          <StepButton onClick={() => nudgeOffset(100)}>+0.1</StepButton>
          <StepButton onClick={() => nudgeOffset(500)}>+0.5</StepButton>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-espresso-mute">
          字幕比原声早出现 → 调正值；字幕比原声晚出现 → 调负值。
        </p>
      </div>

      <div className="my-4 h-px bg-espresso/10" />

      {/* expired cues */}
      <div>
        <span className="text-[12px] font-medium text-espresso/80">过期字幕策略</span>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(
            [
              { value: "read-all", label: "逐条补读", hint: "不漏任何一句" },
              { value: "skip", label: "跳到进度", hint: "跳过已错过的" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSettings({ expiredPolicy: option.value })}
              className={cn(
                "rounded-xl border px-2.5 py-2 text-left transition",
                settings.expiredPolicy === option.value
                  ? "border-rust bg-rust/10"
                  : "border-espresso/15 bg-paper hover:border-espresso/30",
              )}
            >
              <span className="block text-[12px] font-medium text-espresso">{option.label}</span>
              <span className="mt-0.5 block font-mono text-[9.5px] tracking-wide text-espresso-mute">
                {option.hint}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
});
