/** Time formatting helpers shared by the deck and the cue list. */

export function formatClock(seconds: number, opts: { withHours?: boolean } = {}): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const total = Math.floor(safe);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0 || opts.withHours) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function formatClockPrecise(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const base = formatClock(safe);
  const tenth = Math.floor((safe % 1) * 10);
  return `${base}.${tenth}`;
}

export function formatOffset(ms: number): string {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : "±";
  const abs = Math.abs(ms);
  const whole = Math.floor(abs / 1000);
  const rest = abs % 1000;
  if (rest === 0) return `${sign}${whole}.0s`;
  return `${sign}${whole}.${String(Math.round(rest / 100))}s`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
