import { cn } from "@/lib/utils";

/** Empty-state illustration: a vintage deck, headphones and fanned subtitle cards. */
export function TapeIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 320" className={cn("h-auto w-full", className)} role="img" aria-label="卡带机与耳机的插画">
      <path d="M78 300V152a132 132 0 0 1 264 0v148Z" fill="#E9DAC1" />
      <path d="M78 300V152a132 132 0 0 1 264 0v148Z" fill="none" stroke="#2E211C" strokeOpacity="0.08" />

      {/* fanned subtitle cards */}
      <g transform="rotate(-9 148 236)">
        <rect x="66" y="196" width="150" height="94" rx="10" fill="#FCF6EA" stroke="#2E211C" strokeOpacity="0.16" />
        <rect x="82" y="214" width="112" height="7" rx="3.5" fill="#BF5B2E" opacity="0.55" />
        <rect x="82" y="230" width="94" height="7" rx="3.5" fill="#2E211C" opacity="0.18" />
        <rect x="82" y="246" width="104" height="7" rx="3.5" fill="#2E211C" opacity="0.18" />
        <rect x="82" y="262" width="64" height="7" rx="3.5" fill="#D9A441" opacity="0.75" />
      </g>
      <g transform="rotate(7 300 244)">
        <rect x="222" y="204" width="136" height="88" rx="10" fill="#F7EEDC" stroke="#2E211C" strokeOpacity="0.16" />
        <rect x="236" y="220" width="96" height="7" rx="3.5" fill="#2E211C" opacity="0.2" />
        <rect x="236" y="236" width="104" height="7" rx="3.5" fill="#2E211C" opacity="0.2" />
        <rect x="236" y="252" width="72" height="7" rx="3.5" fill="#BF5B2E" opacity="0.6" />
      </g>

      {/* headphones band */}
      <path d="M104 168a106 106 0 0 1 212 0" fill="none" stroke="#BF5B2E" strokeWidth="13" strokeLinecap="round" />
      <path d="M104 168a106 106 0 0 1 212 0" fill="none" stroke="#D97C50" strokeWidth="4" strokeLinecap="round" opacity="0.5" />

      {/* deck body */}
      <rect x="116" y="146" width="188" height="126" rx="16" fill="#2E211C" />
      <rect x="116" y="146" width="188" height="126" rx="16" fill="none" stroke="#C7A46B" strokeWidth="1" opacity="0.4" />
      <rect x="130" y="160" width="160" height="66" rx="9" fill="#3E2C24" />
      {[170, 250].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="193" r="24" fill="#F4E9D8" />
          <circle cx={cx} cy="193" r="24" fill="none" stroke="#C7A46B" strokeWidth="1" opacity="0.6" />
          {[0, 60, 120].map((angle) => (
            <rect
              key={angle}
              x={cx - 1.5}
              y={193 - 19}
              width="3"
              height="38"
              rx="1.5"
              fill="#BF5B2E"
              opacity="0.5"
              transform={`rotate(${angle} ${cx} 193)`}
            />
          ))}
          <circle cx={cx} cy="193" r="6.5" fill="#2E211C" />
        </g>
      ))}
      <rect x="196" y="188" width="28" height="10" rx="5" fill="#241A16" />

      {/* transport buttons */}
      {[0, 1, 2, 3].map((index) => (
        <rect
          key={index}
          x={136 + index * 40}
          y="238"
          width="30"
          height="14"
          rx="4"
          fill={index === 0 ? "#BF5B2E" : "#F4E9D8"}
          opacity={index === 0 ? 1 : 0.35}
        />
      ))}
      <rect x="136" y="258" width="150" height="4" rx="2" fill="#F4E9D8" opacity="0.2" />

      {/* ear cups */}
      <rect x="88" y="150" width="30" height="56" rx="13" fill="#BF5B2E" />
      <rect x="96" y="160" width="14" height="36" rx="7" fill="#96401C" opacity="0.6" />
      <rect x="302" y="150" width="30" height="56" rx="13" fill="#BF5B2E" />
      <rect x="310" y="160" width="14" height="36" rx="7" fill="#96401C" opacity="0.6" />
    </svg>
  );
}
