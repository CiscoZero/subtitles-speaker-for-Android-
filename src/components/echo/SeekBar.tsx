import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SeekBarProps = {
  time: number;
  duration: number;
  marks: number[];
  disabled?: boolean;
  onSeek: (seconds: number) => void;
};

/** Scrubbable timeline with tick marks for every subtitle cue. */
export function SeekBar({ time, duration, marks, disabled, onSeek }: SeekBarProps) {
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const lastSeek = useRef(0);

  const safeDuration = duration > 0 ? duration : 0;
  const ratio = dragRatio ?? (safeDuration ? Math.min(1, Math.max(0, time / safeDuration)) : 0);
  const pct = `${ratio * 100}%`;

  const ratioFrom = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const commit = (nextRatio: number, force = false) => {
    if (!safeDuration) return;
    const now = performance.now();
    if (!force && now - lastSeek.current < 90) return;
    lastSeek.current = now;
    onSeek(nextRatio * safeDuration);
  };

  const visibleMarks =
    marks.length > 320 ? marks.filter((_, index) => index % Math.ceil(marks.length / 320) === 0) : marks;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={Math.round(safeDuration)}
      aria-valuenow={Math.round(time)}
      aria-disabled={disabled}
      className={cn(
        "group relative h-9 w-full touch-none select-none",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const next = ratioFrom(event.clientX);
        setDragRatio(next);
        commit(next, true);
      }}
      onPointerMove={(event) => {
        if (disabled || dragRatio === null) return;
        const next = ratioFrom(event.clientX);
        setDragRatio(next);
        commit(next);
      }}
      onPointerUp={(event) => {
        if (disabled) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        const next = ratioFrom(event.clientX);
        setDragRatio(null);
        commit(next, true);
      }}
      onPointerCancel={() => setDragRatio(null)}
      onKeyDown={(event) => {
        if (disabled || !safeDuration) return;
        if (event.key === "ArrowRight") onSeek(Math.min(safeDuration, time + 5));
        if (event.key === "ArrowLeft") onSeek(Math.max(0, time - 5));
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-[10px] -translate-y-1/2 overflow-hidden rounded-full bg-paper/15 ring-1 ring-inset ring-paper/10">
        <div
          className="h-full rounded-full bg-rust transition-[width] duration-100 ease-linear"
          style={{ width: pct }}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[10px] -translate-y-1/2">
        {visibleMarks.map((mark, index) => {
          const left = safeDuration ? Math.min(100, (mark / safeDuration) * 100) : 0;
          return (
            <span
              key={`${mark}-${index}`}
              className="absolute top-1/2 h-[7px] w-px -translate-y-1/2 bg-paper/30"
              style={{ left: `${left}%` }}
            />
          );
        })}
      </div>

      <div
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rust bg-paper shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-transform duration-150 group-hover:scale-110"
        style={{ left: pct }}
      />
    </div>
  );
}
