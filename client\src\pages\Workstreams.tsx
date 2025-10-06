import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "../App";
import { useToast } from "@/hooks/use-toast";
import AreaChips from "../components/AreaChips";

export default function Workstreams(){
  const params = useParams();
  const org = useOrg();
  const contextProjectId = org?.projectId;
  const projectId = params.projectId || contextProjectId;

  const navigate = useNavigate();
  const { toast } = useToast();

  // Query for areas summary
  const { data: areasData, isLoading: areasLoading, error: areasError } = useQuery({
    queryKey: [`/api/areas/summary_all?project_id=${projectId}`],
    enabled: !!projectId
  });

  // Query for comment counts
  const { data: commentData, isLoading: commentsLoading, error: commentsError } = useQuery({
    queryKey: [`/api/area_comments/count?project_id=${projectId}`],
    enabled: !!projectId
  });

  // Query for area owners
  const { data: ownersData, isLoading: ownersLoading } = useQuery({
    queryKey: [`/api/stages/owners_by_area?project_id=${projectId}`],
    enabled: !!projectId
  });

  const items = (areasData as any)?.items || [];
  const commentCounts: {[key: string]: number} = {};
  (commentData as any)?.areas?.forEach((area: any) => {
    commentCounts[area.area] = area.comment_count;
  });

  const owners: {[key: string]: string[]} = (ownersData as any)?.owners || {};

  const isLoading = areasLoading || commentsLoading || ownersLoading;

  return (
    <div className="space-y-4" data-testid="workstreams-overview">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workstreams</h1>
      </div>
      
      {/* Area chips for quick navigation */}
      <AreaChips />
      
      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="brand-card p-3 animate-pulse" data-testid="area-card-skeleton">
              <div className="h-4 bg-muted rounded w-20 mb-2"></div>
              <div className="space-y-1">
                <div className="h-3 bg-muted rounded w-32"></div>
                <div className="h-3 bg-muted rounded w-28"></div>
                <div className="h-3 bg-muted rounded w-24"></div>
              </div>
            </div>
          ))}
        </div>
      ) : (areasError || commentsError) ? (
        <div className="col-span-full p-8 text-center text-red-500" data-testid="areas-error">
          <div className="text-sm">
            {areasError && "Failed to load workstreams data."}
            {commentsError && " Failed to load comment counts."}
            {" Please try again."}
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-3">
          {items.map((i: any)=>{
            const m=i.metrics||{}; 
            const s=(m.status||"").toLowerCase();
            // Use neutral cards with colored accent borders instead of full colored backgrounds
            const accentColor = s==="green"?"border-l-emerald-500":s==="at_risk"?"border-l-red-500":s==="late"?"border-l-orange-500":"border-l-amber-500";
            return (
              <button 
                key={i.area} 
                className={`brand-card p-3 text-left border-l-4 ${accentColor} bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors`} 
                data-testid={`area-card-${i.area.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={()=>navigate(`/projects/${projectId}/workstreams/${encodeURIComponent(i.area)}`)}
              >
                <div className="text-sm font-medium" data-testid={`area-title-${i.area.toLowerCase().replace(/\s+/g, '-')}`}>
                  {i.area}
                </div>
                <div className="text-xs text-muted-foreground">
                  Actions open: <b data-testid={`actions-count-${i.area.toLowerCase().replace(/\s+/g, '-')}`}>{m.actions_open??"—"}</b> · Risks: <b data-testid={`risks-count-${i.area.toLowerCase().replace(/\s+/g, '-')}`}>{m.risks_open??"—"}</b><br/>
                  Workbooks: <b data-testid={`workbooks-progress-${i.area.toLowerCase().replace(/\s+/g, '-')}`}>{m.workbooks_done??0}/{m.workbooks_total??0}</b> · Comments: <b data-testid={`comments-count-${i.area.toLowerCase().replace(/\s+/g, '-')}`}>{commentCounts[i.area] ?? 0}</b><br/>
                  Next mtg: {m.next_meeting? new Date(m.next_meeting).toLocaleString():"—"}
                </div>
                <div className="mt-1 flex gap-1 flex-wrap" data-testid={`area-owners-${i.area.toLowerCase().replace(/\s+/g, '-')}`}>
                  {(owners[i.area]||[]).slice(0,3).map(u=><span key={u} className="text-[11px] px-1.5 py-[1px] rounded bg-slate-500/15 text-slate-600" data-testid={`owner-chip-${u}`}>{u}</span>)}
                </div>
              </button>
            );
          })}
          {!items.length && (
            <div className="col-span-full p-8 text-center text-muted-foreground" data-testid="no-areas-message">
              <div className="text-sm">No areas available yet.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}