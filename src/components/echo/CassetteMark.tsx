import { cn } from "@/lib/utils";

/** Minimal 1970s cassette mark — rust body, cream window, two reels. */
export function CassetteMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="译声机">
      <rect x="3" y="9" width="42" height="30" rx="7" fill="currentColor" />
      <rect x="9.5" y="14.5" width="29" height="13" rx="4" fill="#FBF4E8" />
      <circle cx="17.5" cy="21" r="4.4" fill="currentColor" />
      <circle cx="17.5" cy="21" r="1.6" fill="#FBF4E8" />
      <circle cx="30.5" cy="21" r="4.4" fill="currentColor" />
      <circle cx="30.5" cy="21" r="1.6" fill="#FBF4E8" />
      <path d="M12 32.5h24" stroke="#FBF4E8" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
      <path d="M17 35.5v3M31 35.5v3" stroke="#FBF4E8" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function CassetteMarkBare({ className }: { className?: string }) {
  return <CassetteMark className={cn("text-rust", className)} />;
}
