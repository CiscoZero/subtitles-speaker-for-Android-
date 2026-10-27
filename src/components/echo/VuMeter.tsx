import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type VuMeterProps = {
  active: boolean;
  speaking: boolean;
  className?: string;
};

const TICKS = [-45, -34, -23, -12, 0, 12, 23, 34, 45];

/**
 * Decorative analog VU dial. The needle sways while the original audio runs and
 * drops to rest whenever the deck is paused (i.e. while Chinese is being read).
 */
export function VuMeter({ active, speaking, className }: VuMeterProps) {
  const needleRef = useRef<SVGGElement | null>(null);
  const stateRef = useRef({ target: 0, current: 0, last: 0, seed: 137 });

  useEffect(() => {
    let raf = 0;
    const loop = (stamp: number) => {
      raf = window.requestAnimationFrame(loop);
      const state = stateRef.current;
      const running = active && !speaking;
      if (running) {
        if (stamp - state.last > 140) {
          state.last = stamp;
          state.seed = (state.seed * 9301 + 49297) % 233280;
          state.target = 0.24 + (state.seed / 233280) * 0.6;
        }
      } else {
        state.target = 0;
      }
      state.current += (state.target - state.current) * (running ? 0.18 : 0.07);
      const angle = -45 + state.current * 90;
      needleRef.current?.setAttribute("transform", `rotate(${angle.toFixed(2)} 50 57)`);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [active, speaking]);

  return (
    <svg viewBox="0 0 100 66" className={cn("shrink-0", className)} aria-hidden="true">
      <rect x="1.5" y="1.5" width="97" height="63" rx="9" fill="#F7EEDC" />
      <rect
        x="1.5"
        y="1.5"
        width="97"
        height="63"
        rx="9"
        fill="none"
        stroke="#C7A46B"
        strokeWidth="1.6"
        opacity="0.85"
      />
      <path d="M16 57a34 34 0 0 1 68 0" fill="none" stroke="#2E211C" strokeOpacity="0.18" strokeWidth="1.5" />
      {TICKS.map((angle) => (
        <g key={angle} transform={`rotate(${angle} 50 57)`}>
          <line
            x1="50"
            y1="23"
            x2="50"
            y2={Math.abs(angle) >= 34 ? 28 : 27}
            stroke={angle >= 23 ? "#BF5B2E" : "#2E211C"}
            strokeOpacity={angle >= 23 ? 0.9 : 0.35}
            strokeWidth={angle === 0 ? 2 : 1.4}
            strokeLinecap="round"
          />
        </g>
      ))}
      <text x="50" y="48" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="#7C6153">
        VU
      </text>
      <g ref={needleRef}>
        <line x1="50" y1="57" x2="50" y2="25" stroke="#BF5B2E" strokeWidth="2" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="57" r="3.4" fill="#2E211C" />
      <circle cx="50" cy="57" r="1.2" fill="#F4E9D8" />
    </svg>
  );
}
