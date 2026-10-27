import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Search, X } from "lucide-react";
import type { Cue } from "@/lib/subtitles";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

type CueListProps = {
  cues: Cue[];
  activeCue: number | null;
  pointer: number;
  fileName: string | null;
  format: string | null;
  encoding: string | null;
  warnings: string[];
  onJump: (index: number) => void;
  onClear: () => void;
};

export const CueList = memo(function CueList({
  cues,
  activeCue,
  pointer,
  fileName,
  format,
  encoding,
  warnings,
  onJump,
  onClear,
}: CueListProps) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) return cues.map((cue) => ({ cue, index: cue.id }));
    return cues
      .map((cue, index) => ({ cue, index }))
      .filter(({ cue }) => cue.text.includes(keyword));
  }, [cues, query]);

  useEffect(() => {
    if (activeCue === null) return;
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-cue="${activeCue}"]`);
    if (!row) return;
    const target = row.offsetTop - list.clientHeight / 2 + row.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeCue]);

  return (
    <section className="flex h-full flex-col rounded-3xl border border-espresso/10 bg-paper-light/85 p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold leading-tight text-espresso">字幕卷</h2>
          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-espresso-mute">
            {fileName ?? "no subtitle loaded"}
          </p>
        </div>
        {fileName && (
          <button
            type="button"
            onClick={onClear}
            aria-label="移除字幕"
            className="grid size-7 shrink-0 place-items-center rounded-full text-espresso-mute transition hover:bg-espresso/10 hover:text-espresso"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {fileName && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {format && (
            <span className="rounded-full bg-espresso px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-paper">
              {format}
            </span>
          )}
          <span className="rounded-full border border-espresso/15 px-2 py-0.5 font-mono text-[9px] tracking-widest text-espresso-mute">
            {cues.length} 条
          </span>
          {encoding && (
            <span className="rounded-full border border-espresso/15 px-2 py-0.5 font-mono text-[9px] tracking-widest text-espresso-mute">
              {encoding}
            </span>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-2 space-y-1 rounded-xl bg-mustard/15 px-2.5 py-2">
          {warnings.slice(0, 3).map((warning) => (
            <p key={warning} className="flex gap-1.5 text-[11px] leading-snug text-[#7A5518]">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      )}

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-espresso-mute" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索字幕文本…"
          className="w-full rounded-full border border-espresso/15 bg-paper py-1.5 pl-8 pr-3 text-[13px] text-espresso placeholder:text-espresso-mute/70 focus:border-rust/60 focus:outline-none focus:ring-2 focus:ring-rust/20"
        />
      </div>

      <div
        ref={listRef}
        className="slim-scroll relative mt-3 min-h-[220px] flex-1 overflow-y-auto pr-1"
        style={{ maxHeight: "min(60vh, 560px)" }}
      >
        {cues.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-espresso/20 px-4 text-center">
            <p className="font-display text-[15px] font-semibold text-espresso">还没有字幕</p>
            <p className="text-[12px] leading-relaxed text-espresso-mute">
              支持 WebVTT（.vtt）、SRT（.srt）、ASS/SSA（.ass）、LRC（.lrc）与纯文本。
              <br />
              装入后每一句都会列在这里，点击任意一句即可立即重听。
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-espresso-mute">没有匹配的字幕</p>
        ) : (
          filtered.map(({ cue, index }) => {
            const isActive = activeCue === index;
            const isRead = index < pointer;
            return (
              <button
                key={cue.id}
                type="button"
                data-cue={index}
                data-active={isActive ? "true" : "false"}
                onClick={() => onJump(index)}
                className={cn(
                  "mb-1 flex w-full gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                  isActive
                    ? "bg-rust text-paper"
                    : isRead
                      ? "text-espresso/40 hover:bg-espresso/5"
                      : "text-espresso hover:bg-espresso/[0.06]",
                )}
              >
                <span className="mt-0.5 w-6 shrink-0 font-mono text-[10px] tabular opacity-55">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block font-mono text-[10px] tabular tracking-wider",
                      isActive ? "text-paper/70" : "text-espresso-mute/80",
                    )}
                  >
                    {formatClock(cue.start, { withHours: true })}
                    {isActive && " · 朗读中"}
                  </span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug">{cue.text}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
});
