import { listMonth, getEntry } from './s3Client';

async function gatherMonth(yyyy: string, mm: string) {
  const days = await listMonth(yyyy, mm);
  const results = await Promise.all(
    days.map(async (dd) => {
      const ymd = `${yyyy}-${mm}-${dd}`;
      try {
        const body = await getEntry(ymd);
        return { ymd, body };
      } catch {
        return { ymd, body: null };
      }
    })
  );
  const entries: Record<string, unknown> = {};
  for (const { ymd, body } of results) {
    if (body) {
      try {
        entries[ymd] = JSON.parse(body);
      } catch {
        entries[ymd] = body;
      }
    }
  }
  return entries;
}

export async function downloadMonthJSON(yyyy: string, mm: string) {
  const entries = await gatherMonth(yyyy, mm);
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${yyyy}-${mm}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadMonthMarkdown(yyyy: string, mm: string) {
  const entries = await gatherMonth(yyyy, mm);
  let md = '';
  for (const [ymd, entry] of Object.entries(entries)) {
    const text = (entry as { text?: string }).text ?? '';
    md += `## ${ymd}\n\n${text}\n\n`;
  }
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${yyyy}-${mm}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
