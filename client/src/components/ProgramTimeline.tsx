import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJSON } from "@/lib/authFetch";
import { useLocation } from "wouter";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface Stage {
  id: string;
  title: string;
  area?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export default function ProgramTimeline({ projectId }: { projectId: string }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [signed, setSigned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [location, navigate] = useLocation();
  const [ownerByArea, setOwnerByArea] = useState<Record<string,string>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Load stages and signed status
        const [stagesData, signedData] = await Promise.all([
          getJSON<{ stages: Stage[] }>(`/api/stages/list?project_id=${projectId}`),
          getJSON<{ stage_ids: string[] }>(`/api/stages/signed?project_id=${projectId}`)
        ]);
        setStages(stagesData.items || stagesData.stages || []);
        setSigned(new Set(signedData.stage_ids || []));
      } catch (error) {
        console.error('Failed to load timeline data:', error);
        setStages([]);
        setSigned(new Set());
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  useEffect(() => {
    (async () => {
      try {
        const d = await getJSON<{owner_by_area:Record<string,string>}>(`/api/stages/owners_by_area?project_id=${projectId}`);
        setOwnerByArea(d.owner_by_area || {});
      } catch {
        setOwnerByArea({});
      }
    })();
  }, [projectId]);

  // Define colors for different areas (fallback)
  const colors = {
    Discovery: "var(--brand-accent)",
    Design: "var(--brand-accent)", 
    Config: "var(--brand-chart-3)",
    Deploy: "var(--brand-muted)",
    HCM: "var(--brand-accent)",
    Payroll: "var(--brand-chart-3)",
    Finance: "var(--brand-chart-2)",
    default: "var(--brand-accent)"
  };

  if (loading) {
    return (
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading timeline...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold" data-testid="timeline-title">Program Timeline</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-primary text-primary-foreground" data-testid="timeline-view-week">
              Week
            </Button>
            <Button size="sm" variant="ghost" data-testid="timeline-view-month">
              Month
            </Button>
            <Button size="sm" variant="ghost" data-testid="timeline-view-quarter">
              Quarter
            </Button>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-3 text-xs mb-2">
          <div className="flex items-center gap-1"><span style={{display:'inline-block',width:10,height:4,background:'var(--brand-good)'}}/> Signed</div>
          <div className="flex items-center gap-1"><span style={{display:'inline-block',width:10,height:4,background:'var(--brand-warn)'}}/> At risk</div>
          <div className="flex items-center gap-1"><span style={{display:'inline-block',width:10,height:4,background:'var(--brand-accent)'}}/> In-progress</div>
        </div>

        <div className="space-y-4 timeline">
          {stages.map((s, index) => {
            // Compute display strings
            const sStr = s.start_date ? new Date(s.start_date).toLocaleDateString() : "(start)";
            const eStr = s.end_date ? new Date(s.end_date).toLocaleDateString() : "(end)";
            const ownerGuess = s.area ? ownerByArea[s.area] : "";
            const tipContent = {
              title: s.title,
              area: s.area,
              dates: `${sStr} → ${eStr}`,
              owner: ownerGuess
            };
            
            // Signed and at-risk logic
            const today = new Date();
            const signedNow = signed.has(s.id);
            const atRisk = !signedNow && s.end_date ? (new Date(s.end_date) < today) : false;

            const baseCol = colors[s.area as keyof typeof colors] || colors.default;
            const col = signedNow ? "var(--brand-good)" : (atRisk ? "var(--brand-warn)" : baseCol);
            const glow = signedNow
              ? "0 0 14px rgba(25,212,146,.35)"
              : (s.status==="in_review" ? "0 0 14px rgba(29,228,255,0.35)" : (atRisk ? "0 0 14px rgba(255,211,79,.35)" : "none"));

            // Calculate progress based on dates
            let pctStart = 0;
            let pctW = 100;
            if (s.start_date && s.end_date) {
              const start = new Date(s.start_date).getTime();
              const end = new Date(s.end_date).getTime();
              const now = Date.now();
              const total = end - start;
              if (total > 0) {
                const elapsed = Math.max(0, now - start);
                pctW = Math.min(100, (elapsed / total) * 100);
              }
            }
            
            const gotoStage = () => navigate(`/projects/${projectId}/stages/manage?focus=${s.id}`);
            
            return (
              <div key={s.id} className="mb-3">
                <div className="text-xs flex justify-between mb-1">
                  <span>{s.title} {s.area ? ` • ${s.area}` : ""}</span>
                  <span className="text-muted-foreground">{s.status || ""}</span>
                </div>
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <div className="timeline">
                      <div
                        className="relative bar-bg cursor-pointer"
                        onClick={gotoStage}
                      >
                        <div 
                          className="absolute bar-fill"
                          style={{ 
                            left: `${pctStart}%`,
                            width: `${Math.max(pctW, 5)}%`, // Minimum 5% width for visibility
                            background: col,
                            boxShadow: glow
                          }}
                        />
                        {signedNow && (
                          <div 
                            className="absolute -top-4" 
                            style={{ left: `calc(${pctStart}% + ${pctW/2}%)` }}
                          >
                            <span style={{fontSize:'10px',color:'var(--brand-success)'}}>✔</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-80">
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{tipContent.title}</h4>
                      {tipContent.area && (
                        <p className="text-sm text-muted-foreground">Area: {tipContent.area}</p>
                      )}
                      <p className="text-sm text-muted-foreground">Duration: {tipContent.dates}</p>
                      {tipContent.owner && (
                        <p className="text-sm text-muted-foreground">Owner: {tipContent.owner}</p>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
                <div className="mt-1 flex justify-end">
                  <button
                    className="brand-btn text-[11px] swoosh"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const email = prompt("Send sign-off request to:", ownerGuess || "");
                      if (!email) return;
                      try {
                        await fetch(`/api/stages/request_signoff?project_id=${projectId}`, {
                          method: "POST",
                          credentials: "include",
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ stage_id: s.id, email_to: email, title: s.title, area: s.area })
                        });
                        alert("Request sent");
                      } catch (e: any) {
                        alert(String(e?.message || e));
                      }
                    }}
                    title="Request sign-off"
                  >Request Sign-Off</button>
                </div>
              </div>
            );
          })}
          {!stages.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No stages configured yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
