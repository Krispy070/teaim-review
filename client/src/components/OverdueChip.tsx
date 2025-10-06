import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { getJSON } from "@/lib/authFetch";

export default function OverdueChip(){
  // Use wouter's useRoute to extract projectId from current route
  const [match, params] = useRoute("/projects/:projectId/*");
  const projectId = params?.projectId;
  const [n,setN] = useState<number>(0);

  async function load(){
    if (!projectId) return;
    try {
      const d = await getJSON(`/api/actions/overdue?project_id=${projectId}`);
      setN((d.items||[]).length);
    } catch { setN(0); }
  }
  useEffect(()=>{ load(); const t = setInterval(load, 60_000); return ()=>clearInterval(t); }, [projectId]);

  if (!n) return null;
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-600 text-white text-xs" data-testid="chip-overdue">
      Overdue: <b>{n}</b>
    </div>
  );
}