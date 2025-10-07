export function parseICS(text: string) {
  const events: any[] = [];
  const lines = text.replace(/\r\n/g, "\n").split(/\n/);
  let cur: any = null;
  const fold = (v: string) => v.replace(/\\n/g, "\n").replace(/\\,/g, ",");
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).toUpperCase();
    const val = line.slice(idx + 1);
    if (key.startsWith("SUMMARY")) cur.summary = fold(val);
    if (key.startsWith("DTSTART")) cur.dtstart = val;
    if (key.startsWith("DTEND")) cur.dtend = val;
    if (key.startsWith("LOCATION")) cur.location = fold(val);
    if (key.startsWith("DESCRIPTION")) cur.description = fold(val);
    if (key.startsWith("URL")) cur.url = val;
  }
  return events;
}
