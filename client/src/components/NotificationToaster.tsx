import { useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function NotificationToaster(){
  const { projectId } = useParams();
  const { toast } = useToast();
  const lastTopId = useRef<string | null>(null);

  async function poll(){
    try{
      const r = await fetch(`/api/notifications/list?project_id=${projectId}`, { credentials:"include" });
      if (!r.ok) return;
      const d = await r.json();
      const unread = (d.items||[]).filter((x:any)=>!x.is_read);
      
      if (unread.length > 0) {
        const latest = unread[0];
        // Only show toast if this is a new notification we haven't shown before
        if (latest.id && latest.id !== lastTopId.current) {
          toast({
            title: latest.title || "New notification",
            description: latest.body?.message || undefined,
            link: latest.link,
            projectId: projectId,
            variant: "default"
          });
          lastTopId.current = latest.id;
        }
      }
    }catch(e){
      // Silent fail to avoid console spam in development
    }
  }

  // Reset tracking when switching projects to prevent cross-project leakage
  useEffect(() => {
    lastTopId.current = null;
  }, [projectId]);

  useEffect(()=>{ const t=setInterval(poll, 8000); return ()=>clearInterval(t); },[projectId]);

  // This component no longer renders its own UI - it uses the shadcn toast system
  return null;
}