import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";

export function useIngestHealth(pollMs = 15000) {
  const pid = getProjectId();
  const [data, setData] = useState<{ embed: any; parse: any; runs24: any } | null>(null);
  const [err, setErr] = useState<string>("");
  async function load() {
    try {
      const r = await fetchWithAuth(`/api/health/ingest?projectId=${encodeURIComponent(pid!)}`);
      const j = await r.json();
      if (r.ok) {
        setData(j);
        setErr("");
      } else setErr(j.error || "load failed");
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }
  useEffect(() => {
    if (!pid) return;
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [pid, pollMs]);
  return { data, err, refresh: load };
}

export function usePageFeed(pollMs = 60000) {
  const pid = getProjectId();
  const [counts, setCounts] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  async function load() {
    try {
      const r = await fetchWithAuth(`/api/health/page?projectId=${encodeURIComponent(pid!)}`);
      const j = await r.json();
      if (r.ok) {
        setCounts(j.counts || {});
        setErr("");
      } else setErr(j.error || "load failed");
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }
  useEffect(() => {
    if (!pid) return;
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [pid, pollMs]);
  return { counts, err, refresh: load };
}
