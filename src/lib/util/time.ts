// Time helpers. US cash equity session is ~13:30–20:00 UTC (09:30–16:00 ET),
// Mon–Fri. Tokenized stocks trade 24/7, so "underlying market open" is a key
// signal for the 24/7-vs-limited-hours wedge.

export function isUsMarketOpen(date: Date): boolean {
  const day = date.getUTCDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return false;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const open = 13 * 60 + 30;
  const close = 20 * 60;
  return minutes >= open && minutes < close;
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function minutesBetween(aIso: string, bIso: string): number {
  return Math.round(
    (new Date(bIso).getTime() - new Date(aIso).getTime()) / 60_000,
  );
}
