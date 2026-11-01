/**
 * Request timestamps are only rendered when the backend supplied a valid ISO
 * instant. Anything else is shown as unavailable rather than invented.
 */
export function formatRequestTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = date.getTime() - Date.now();
  const absMinutes = Math.abs(diffMs) / 60_000;
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absMinutes < 1) return "Just now";
  if (absMinutes < 60) return formatter.format(Math.round(diffMs / 60_000), "minute");
  if (absMinutes < 24 * 60) return formatter.format(Math.round(diffMs / 3_600_000), "hour");
  if (absMinutes < 30 * 24 * 60) return formatter.format(Math.round(diffMs / 86_400_000), "day");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
