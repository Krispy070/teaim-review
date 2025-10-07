import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { fetchWithAuth } from "@/lib/supabase";
import PageHeading from "@/components/PageHeading";
import TimelineGantt from "@/components/timeline/TimelineGantt";
import { getProjectId } from "@/lib/project";

interface TimelineEvent {
  id: string;
  title: string;
  type: string;
  startsAt: string | null;
  endsAt: string | null;
  confidence: string;
  source: string | null;
  docId: string;
}

export default function TimelineInsights() {
  const [items, setItems] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [location] = useLocation();
  const projectId = getProjectId();

  useEffect(() => {
    (async () => {
      if (!projectId) return;
      setLoading(true);
      try {
        const r = await fetchWithAuth(`/api/insights/timeline?projectId=${encodeURIComponent(projectId)}`);
        const j = await r.json();
        setItems(j.items || []);
      } catch (err) {
        console.error("Failed to load timeline:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  return (
    <div className="p-3">
      <PageHeading title="Timeline Events" crumbs={[{label:"Overview"},{label:"Timeline Events"}]} />
      <div className="p-6 space-y-6">
        {loading ? (
          <div className="opacity-70">Loading...</div>
        ) : (
          <>
            <TimelineGantt items={items} />
            
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">Event Details</h3>
              <ul className="space-y-3">
                {items.map(i => (
                  <li key={i.id} className="p-3 border rounded-2xl" data-testid={`timeline-event-${i.id}`}>
                    <div className="text-sm opacity-60">
                      {i.type} • {i.startsAt ? new Date(i.startsAt).toLocaleString() : "TBD"}
                      {i.endsAt && ` → ${new Date(i.endsAt).toLocaleString()}`}
                    </div>
                    <div className="font-medium">{i.title}</div>
                    {i.source && <div className="text-xs mt-1 opacity-70">source: "{i.source}"</div>}
                  </li>
                ))}
                {!items.length && <li className="opacity-70">No events yet. Upload docs to populate.</li>}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
