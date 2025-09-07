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

/** Human friendly date like 'Mon, 08 Sep 2025' */
export function displayDate(ymd: string): string {
  const d = parseYmd(ymd);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${weekdays[d.getDay()]}, ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
