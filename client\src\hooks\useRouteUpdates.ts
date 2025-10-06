import { useEffect, useState } from "react";
import { getJSON } from "@/lib/authFetch";

export function useRouteUpdates(projectId: string) {
  const [feed, setFeed] = useState<Record<string, string>>({});
  
  useEffect(() => {
    (async () => {
      try {
        const d = await getJSON(`/api/updates/feed?project_id=${projectId}`);
        setFeed(d.items || {});
      } catch {
        setFeed({});
      }
    })();
  }, [projectId]);
  
  function unseenKeys() {
    const keys = Object.keys(feed || {});
    const unseen = [];
    for (const k of keys) {
      try {
        const seen = localStorage.getItem(`kap.route.lastSeen.${projectId}.${k}`);
        const lu = feed[k];
        if (lu && (!seen || new Date(lu) > new Date(seen))) unseen.push(k);
      } catch {}
    }
    return unseen;
  }
  
  function markAllSeen() {
    const keys = Object.keys(feed || {});
    const now = new Date().toISOString();
    try {
      for (const k of keys) localStorage.setItem(`kap.route.lastSeen.${projectId}.${k}`, now);
    } catch {}
  }
  
  return { feed, unseenKeys, markAllSeen };
}