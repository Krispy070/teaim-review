import { useEffect, useMemo, useRef, useState } from "react";

export default function ArtifactViewerPage() {
  const [mode, setMode] = useState<"auto"|"text"|"table"|"json"|"pdf"|"raw">("auto");
  const [ct, setCt] = useState<string>("");
  const [data, setData] = useState<string>("");
  const [url, setUrl] = useState<string>("");
  const [q, setQ] = useState<string>("");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(location.search);
      const u = params.get("url") || "";
      setUrl(u);
      if (!u) return;

      const r = await fetch(u, { method: "GET", headers: { "Accept": "*/*" } });
      const ctype = r.headers.get("Content-Type") || "";
      setCt(ctype);

      const isPdf  = /application\/pdf/i.test(ctype);
      const isJson = /application\/json/i.test(ctype);
      const isCsv  = /(text\/csv|\.csv(\?|$))/i.test(ctype) || /\.csv(\?|$)/i.test(u);
      const isText = /^text\/|xml|html/i.test(ctype);

      if (mode === "auto") {
        if (isPdf)  setMode("pdf");
        else if (isJson) setMode("json");
        else if (isCsv)  setMode("table");
        else if (isText) setMode("text");
        else setMode("raw");
      }
      if (isPdf || mode === "pdf" || mode === "raw") return;

      const buf = await r.arrayBuffer();
      const txt = new TextDecoder("utf-8").decode(new Uint8Array(buf));
      setData(txt);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background dark:bg-slate-950">
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .print-hide { display: none !important; }
          .artifact-content { 
            background: white !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 12pt !important;
            color: black !important;
          }
          .artifact-content pre { 
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            page-break-inside: avoid;
          }
          .artifact-content table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          .artifact-content th, .artifact-content td {
            border: 1px solid #000 !important;
            padding: 4pt !important;
            color: black !important;
            background: white !important;
          }
          .artifact-content mark {
            background: transparent !important;
            font-weight: bold !important;
            color: black !important;
          }
        }
      `}</style>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 justify-between print-hide">
          <div className="text-xs opacity-70">Content-Type: {ct || "unknown"}</div>
          <div className="flex items-center gap-2">
            {mode !== "pdf" && mode !== "raw" && (
              <input className="border rounded px-2 py-1 text-sm" placeholder="Search (highlight)…"
                     value={q} onChange={e => setQ(e.target.value)} data-testid="input-search-highlight" />
            )}
            <button 
              className="text-xs px-2 py-1 border rounded hover:bg-slate-100 dark:hover:bg-slate-800" 
              onClick={() => window.print()}
              data-testid="button-print"
            >
              Print
            </button>
            {url && (
              <a className="text-xs px-2 py-1 border rounded" href={url} target="_blank" rel="noreferrer" data-testid="link-open-original">Open original</a>
            )}
          </div>
        </div>

        {mode === "pdf" && url ? (
          <iframe src={url} className="w-full h-[78vh] border rounded-2xl print-hide" data-testid="pdf-viewer" />
        ) : mode === "json" ? (
          <pre className="artifact-content text-xs whitespace-pre-wrap p-3 border rounded-2xl bg-slate-900/40" data-testid="json-viewer">
            {highlight(prettyJson(data), q)}
          </pre>
        ) : mode === "table" ? (
          <CsvTable csv={data} q={q} />
        ) : mode === "text" ? (
          <pre className="artifact-content text-sm whitespace-pre-wrap p-3 border rounded-2xl bg-slate-900/40" data-testid="text-viewer">
            {highlight(data, q)}
          </pre>
        ) : (
          <div className="text-sm opacity-70 print-hide">This file type is not previewable. Use "Open original".</div>
        )}
      </div>
    </div>
  );
}

function prettyJson(s: string) {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
function highlight(s: string, term: string) {
  if (!term) return s;
  try {
    const re = new RegExp(`(${escapeReg(term)})`, "ig");
    const parts = s.split(re);
    return parts.map((p, i) => i % 2 ? <mark key={i} className="bg-yellow-600/50">{p}</mark> : p);
  } catch { return s; }
}
function escapeReg(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

type ColType = "number" | "date" | "text";

function detectColumnType(values: string[]): ColType {
  const sample = values.slice(0, 200).filter(v => v && v.trim());
  if (sample.length === 0) return "text";

  const numCount = sample.filter(v => !isNaN(Number(v)) && v.trim() !== "").length;
  if (numCount / sample.length >= 0.8) return "number";

  const dateCount = sample.filter(v => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && v.match(/\d{4}|\d{1,2}[-/]\d{1,2}/);
  }).length;
  if (dateCount / sample.length >= 0.6) return "date";

  return "text";
}

function CsvTable({ csv, q }: { csv: string; q: string }) {
  const parsed = useMemo(() => parseCsv(csv), [csv]);
  const headers = parsed[0] || [];
  const rowsRaw = parsed.slice(1);

  const [sortIdx, setSortIdx] = useState<number>(0);
  const [asc, setAsc] = useState(true);
  const [filters, setFilters] = useState<string[]>(() => headers.map(() => ""));

  const colTypes = useMemo<ColType[]>(() => {
    return headers.map((_, i) => detectColumnType(rowsRaw.map(r => r[i] || "")));
  }, [headers, rowsRaw]);

  const filtered = rowsRaw.filter(r => {
    const passQ = !q || r.some(c => (c || "").toLowerCase().includes(q.toLowerCase()));
    const passCols = r.every((c, i) => {
      const f = filters[i];
      if (!f) return true;
      
      const type = colTypes[i];
      const val = c || "";
      
      if (type === "number") {
        const num = Number(val);
        if (isNaN(num) && val.trim()) return false;
        
        if (f.startsWith(">=")) {
          const target = Number(f.slice(2).trim());
          return !isNaN(num) && num >= target;
        } else if (f.startsWith("<=")) {
          const target = Number(f.slice(2).trim());
          return !isNaN(num) && num <= target;
        } else if (f.startsWith(">")) {
          const target = Number(f.slice(1).trim());
          return !isNaN(num) && num > target;
        } else if (f.startsWith("<")) {
          const target = Number(f.slice(1).trim());
          return !isNaN(num) && num < target;
        } else if (f.startsWith("=")) {
          const target = Number(f.slice(1).trim());
          return !isNaN(num) && num === target;
        }
      } else if (type === "date") {
        const d = new Date(val);
        if (isNaN(d.getTime()) && val.trim()) return false;
        
        if (f.startsWith(">=")) {
          const target = new Date(f.slice(2).trim());
          return d >= target;
        } else if (f.startsWith("<=")) {
          const target = new Date(f.slice(2).trim());
          return d <= target;
        } else if (f.startsWith(">")) {
          const target = new Date(f.slice(1).trim());
          return d > target;
        } else if (f.startsWith("<")) {
          const target = new Date(f.slice(1).trim());
          return d < target;
        } else if (f.startsWith("=")) {
          const target = new Date(f.slice(1).trim());
          return d.getTime() === target.getTime();
        }
      }
      
      return String(val).toLowerCase().includes(f.toLowerCase());
    });
    return passQ && passCols;
  });

  const sorted = useMemo(() => {
    const out = [...filtered];
    const type = colTypes[sortIdx];
    
    out.sort((a, b) => {
      const A = a[sortIdx] ?? "", B = b[sortIdx] ?? "";
      
      let cmp = 0;
      if (type === "number") {
        const numA = Number(A), numB = Number(B);
        cmp = numA - numB;
      } else if (type === "date") {
        const dateA = new Date(A).getTime(), dateB = new Date(B).getTime();
        cmp = dateA - dateB;
      } else {
        cmp = String(A).localeCompare(String(B));
      }
      
      return asc ? cmp : -cmp;
    });
    return out;
  }, [filtered, sortIdx, asc, colTypes]);

  const exportRef = useRef<HTMLAnchorElement>(null);
  function exportFiltered() {
    const lines = [
      headers.map(escCsv).join(","),
      ...sorted.map(r => r.map(escCsv).join(","))
    ].join("\r\n");
    const blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    exportRef.current!.href = url;
    exportRef.current!.download = "filtered.csv";
    exportRef.current!.click();
    setTimeout(()=> URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between print-hide">
        <div className="text-xs opacity-70">Rows: {sorted.length.toLocaleString()}</div>
        <div className="flex items-center gap-2">
          <a ref={exportRef} className="hidden" />
          <button className="text-xs px-2 py-1 border rounded" onClick={exportFiltered} data-testid="button-export-csv">
            Export filtered CSV
          </button>
        </div>
      </div>

      <div className="artifact-content overflow-auto border rounded-2xl" data-testid="csv-viewer">
        <table className="text-xs min-w-[900px] w-full">
          <thead className="bg-slate-900/50 sticky top-0">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="text-left px-2 py-1 cursor-pointer select-none"
                    onClick={() => { if (sortIdx === i) setAsc(a => !a); else { setSortIdx(i); setAsc(true); } }}
                    data-testid={`th-${i}`}>
                  <div className="flex items-center gap-1">
                    <span>{h}</span>
                    <span className="text-[9px] opacity-50">{colTypes[i]}</span>
                    <span>{sortIdx === i ? (asc ? "▲" : "▼") : ""}</span>
                  </div>
                </th>
              ))}
            </tr>
            <tr>
              {headers.map((_, i) => {
                const type = colTypes[i];
                const placeholder = type === "number" ? ">, >=, <, <=, =" : 
                                   type === "date" ? ">2024-01-01" : 
                                   "text search…";
                return (
                  <th key={`f-${i}`} className="px-2 py-1">
                    <input
                      className="border rounded px-1 py-0.5 w-full text-[11px]"
                      placeholder={placeholder}
                      value={filters[i] || ""}
                      onChange={e => {
                        const next = filters.slice();
                        next[i] = e.target.value;
                        setFilters(next);
                      }}
                      data-testid={`input-filter-${i}`}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 5000).map((r, ri) => (
              <tr key={ri} className="border-b border-slate-800">
                {r.map((c, ci) => (
                  <td key={ci} className="px-2 py-1">
                    {q || filters[ci] ? highlight(String(c || ""), (filters[ci] || q)) : (c || "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] opacity-60">Showing up to 5,000 rows • Use global search + per-column filters • Click headers to sort.</div>
    </div>
  );
}

function escCsv(v: any) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cur = "", i = 0, q = false;
  const pushCell = () => { row.push(cur); cur = ""; };
  const pushRow = () => { out.push(row); row = []; };

  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  while (i < s.length) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cur += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      cur += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === ',') { pushCell(); i++; continue; }
    if (ch === '\n') { pushCell(); pushRow(); i++; continue; }
    cur += ch; i++;
  }
  pushCell(); if (row.length > 1 || row[0] !== "") pushRow();
  return out;
}
