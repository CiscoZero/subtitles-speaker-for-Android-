type ReelsProps = {
  spinning: boolean;
  className?: string;
};

const REEL_X = [52, 148];
const CY = 46;

/** Two tape reels that physically spin while the original audio is playing. */
export function Reels({ spinning, className }: ReelsProps) {
  return (
    <svg viewBox="0 0 200 92" className={className} aria-hidden="true">
      {/* tape ribbon between the reels */}
      <path
        d={`M${REEL_X[0]} ${CY}h${REEL_X[1] - REEL_X[0]}`}
        stroke="#8B6A4E"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <path d={`M28 ${CY}h24M148 ${CY}h24`} stroke="#8B6A4E" strokeWidth="1.5" opacity="0.28" />

      {REEL_X.map((cx) => (
        <g
          key={cx}
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: "reel 3.4s linear infinite",
            animationPlayState: spinning ? "running" : "paused",
          }}
        >
          <circle cx={cx} cy={CY} r={30} fill="#241A16" />
          <circle cx={cx} cy={CY} r={30} fill="none" stroke="#C7A46B" strokeWidth="1" opacity="0.35" />
          <circle cx={cx} cy={CY} r={25.5} fill="#F4E9D8" />
          <circle cx={cx} cy={CY} r={25.5} fill="none" stroke="#2E211C" strokeOpacity="0.16" />
          {[0, 60, 120].map((angle) => (
            <rect
              key={angle}
              x={cx - 1.6}
              y={CY - 21}
              width={3.2}
              height={42}
              rx={1.6}
              fill="#BF5B2E"
              opacity="0.55"
              transform={`rotate(${angle} ${cx} ${CY})`}
            />
          ))}
          <circle cx={cx} cy={CY} r={7} fill="#2E211C" />
          <circle cx={cx} cy={CY} r={2.4} fill="#F4E9D8" />
        </g>
      ))}
    </svg>
  );
}
