/** Escape cells that could trigger Excel/Sheets formulas or abuse */
export function csvSafe(v: any): string {
  let s = String(v ?? "");
  // Normalize CRLF
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // If starts with a risky char, prefix with single quote
  if (/^[=+\-@]/.test(s) || /^\t/.test(s)) s = "'" + s;
  // Escape quotes
  return `"${s.replace(/"/g, '""')}"`;
}

export function setDownloadHeaders(res: any, filename: string) {
  res.type("text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}
