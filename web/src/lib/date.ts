export function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Format a Date into YYYY-MM-DD */
export function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a YYYY-MM-DD string into a Date object */
export function parseYmd(ymd: string): Date {
  const [y, m, day] = ymd.split('-').map((s) => parseInt(s, 10));
  return new Date(y, m - 1, day);
}

/** Human friendly date like 'Monday, January 1, 2024' */
export function displayDate(ymd: string): string {
  const d = parseYmd(ymd);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
