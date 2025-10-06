import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getJSON, postJSON } from "@/lib/authFetch";
import { downloadGET } from "@/lib/download";
import PageHeading from "@/components/PageHeading";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileText, GitCompare, Download, Calendar, Printer } from "lucide-react";

function daysInMonth(y:number,m:number){ return new Date(y,m,0).getDate(); }

export default function Releases(){
  const { projectId } = useParams();
  const now = new Date(); 
  const [ym, setYm] = useState({y: now.getFullYear(), m: now.getMonth() + 1});
  const [items, setItems] = useState<any[]>([]);
  const [crs, setCrs] = useState<any[]>([]);
  const [allReleases, setAllReleases] = useState<any[]>([]);
  
  async function load() {
    const d = await getJSON(`/api/releases/month?project_id=${projectId}&year=${ym.y}&month=${ym.m}`);
    setItems(d.items || []);
  }
  
  async function loadAllReleases() {
    try {
      const d = await getJSON(`/api/releases_compare/list?project_id=${projectId}&limit=100`);
      setAllReleases(d.releases || []);
    } catch (err) {
      console.log("Failed to load releases for comparison:", err);
      setAllReleases([]);
    }
  }
  
  useEffect(() => {
    load();
    loadAllReleases();
    (async () => {
      const c = await getJSON(`/api/changes/list?project_id=${projectId}`);
      setCrs(c.items || []);
    })();
  }, [projectId, ym]);

  const days = useMemo(() => Array.from({length: daysInMonth(ym.y, ym.m)}, (_, i) => i + 1), [ym]);
  
  return (
    <div className="space-y-6">
      <PageHeading title="Releases" crumbs={[{label:"Governance"},{label:"Releases"}]} />
      
      <Tabs defaultValue="calendar" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="calendar" data-testid="tab-calendar">
            <Calendar className="w-4 h-4 mr-2" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="compare" data-testid="tab-compare">
            <GitCompare className="w-4 h-4 mr-2" />
            Compare
          </TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">
            <FileText className="w-4 h-4 mr-2" />
            Release Notes
          </TabsTrigger>
          <TabsTrigger value="diff" data-testid="tab-diff">
            <Download className="w-4 h-4 mr-2" />
            Diff Notes
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="calendar" className="space-y-4">
          <CalendarView 
            ym={ym} 
            setYm={setYm} 
            items={items} 
            crs={crs} 
            projectId={projectId!} 
            onUpdate={load}
            days={days}
          />
        </TabsContent>
        
        <TabsContent value="compare" className="space-y-4">
          <ReleaseComparison releases={allReleases} projectId={projectId!} />
        </TabsContent>
        
        <TabsContent value="notes" className="space-y-4">
          <ReleaseNotesGenerator releases={allReleases} projectId={projectId!} />
        </TabsContent>
        
        <TabsContent value="diff" className="space-y-4">
          <ReleaseDiffNotes releases={allReleases} projectId={projectId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReleaseCard({projectId,rel,crs,onUpdate}:{projectId:string; rel:any; crs:any[]; onUpdate:()=>void}){
  const [sel,setSel]=useState<string[]>(rel.cr_ids||[]);
  const [hc,setHc]=useState<any>(null);
  
  useEffect(() => { 
    (async () => { 
      try {
        const d = await getJSON(`/api/releases/health?project_id=${projectId}&id=${rel.id}`); 
        setHc(d||{});
      } catch {} 
    })(); 
  }, [projectId, rel.id, rel.cr_ids]);
  
  async function save(){ 
    await postJSON(`/api/releases/attach?project_id=${projectId}&id=${rel.id}&cr_ids=${sel.map(encodeURIComponent).join("&cr_ids=")}`, {}); 
    alert("Attached");
    onUpdate();
  }
  return (
    <div className="border rounded p-2 text-xs bg-white/5" data-testid={`release-card-${rel.id}`}>
      <div className="font-medium" data-testid={`release-name-${rel.id}`}>{rel.name}</div>
      <div className="text-muted-foreground" data-testid={`release-window-${rel.id}`}>
        {rel.window_start||"—"} → {rel.window_end||"—"}
      </div>
      <div className="text-[11px] text-muted-foreground">
        Health: <span className={hc?.health==="ready"?"text-[var(--brand-good)]":hc?.health==="working"?"text-amber-600":"text-slate-600"} data-testid={`release-health-${rel.id}`}>{hc?.health||"n/a"}</span>
      </div>
      <div className="mt-1">
        <div>Attach CRs</div>
        <select 
          multiple 
          className="border rounded p-1 w-full h-[80px]" 
          value={sel} 
          onChange={e=>{
            const opts=Array.from(e.target.selectedOptions).map(o=>o.value); 
            setSel(opts);
          }}
          data-testid={`select-crs-${rel.id}`}
        >
          {crs.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <div className="mt-1 flex gap-1">
          <button 
            className="brand-btn text-[11px]" 
            onClick={save}
            data-testid={`button-save-${rel.id}`}
          >
            Save
          </button>
          <button 
            className="brand-btn text-[11px]" 
            onClick={()=>downloadGET(`/api/releases/notes.csv?project_id=${projectId}&id=${rel.id}`, "release_notes.csv")}
            data-testid={`button-export-${rel.id}`}
          >
            Export Notes
          </button>
        </div>
      </div>
      <div className="mt-1">
        <div className="text-[11px] text-muted-foreground">CRs:</div>
        <div className="flex flex-wrap gap-1">
          {(rel.cr_ids||sel||[]).slice(0,6).map((id:string)=>(
            <span key={id} title={id} className="text-[11px] px-1.5 py-[1px] rounded bg-indigo-500/15 text-indigo-600">{id.slice(0,6)}</span>
          ))}
          {(rel.cr_ids||[]).length>6 && <span className="text-[11px] text-muted-foreground">+{(rel.cr_ids||[]).length-6} more</span>}
        </div>
      </div>
    </div>
  );
}

// Calendar View Component (existing functionality)
function CalendarView({ ym, setYm, items, crs, projectId, onUpdate, days }: {
  ym: {y: number, m: number};
  setYm: (fn: (prev: {y: number, m: number}) => {y: number, m: number}) => void;
  items: any[];
  crs: any[];
  projectId: string;
  onUpdate: () => void;
  days: number[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Release Calendar</span>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setYm(s => ({y: s.m === 1 ? s.y - 1 : s.y, m: s.m === 1 ? 12 : s.m - 1}))}
              data-testid="button-prev-month"
            >
              ◀
            </Button>
            <span className="text-sm font-mono" data-testid="current-month">
              {ym.y}-{String(ym.m).padStart(2,'0')}
            </span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setYm(s => ({y: s.m === 12 ? s.y + 1 : s.y, m: s.m === 12 ? 1 : s.m + 1}))}
              data-testid="button-next-month"
            >
              ▶
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => downloadGET(
                `/api/releases/month.ics?project_id=${projectId}&year=${ym.y}&month=${ym.m}`, 
                `releases_${ym.y}-${String(ym.m).padStart(2,'0')}.ics`
              )}
              data-testid="button-download-ics"
            >
              <Download className="w-4 h-4 mr-2" />
              Download ICS
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-7 gap-2">
          {days.map(d => {
            const day = `${ym.y}-${String(ym.m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const inDay = items.filter(r => (r.window_start||"") <= day && day <= (r.window_end||""));
            return (
              <div key={d} className="border rounded p-2 min-h-[120px]" data-testid={`calendar-day-${d}`}>
                <div className="text-xs text-muted-foreground mb-1">{day}</div>
                <div className="space-y-1">
                  {inDay.map(r => <ReleaseCard key={r.id} projectId={projectId} rel={r} crs={crs} onUpdate={onUpdate}/>)}
                  {!inDay.length && <div className="text-xs text-muted-foreground">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Release Comparison Component
function ReleaseComparison({ releases, projectId }: { releases: any[]; projectId: string }) {
  const [releaseA, setReleaseA] = useState<string>("");
  const [releaseB, setReleaseB] = useState<string>("");
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function compareReleases() {
    if (!releaseA || !releaseB) return;
    
    setLoading(true);
    try {
      const result = await getJSON(
        `/api/releases_compare/compare?project_id=${projectId}&release_a=${releaseA}&release_b=${releaseB}&format=json`
      );
      setComparison(result);
    } catch (err) {
      console.error("Failed to compare releases:", err);
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }

  async function exportHtmlComparison() {
    if (!releaseA || !releaseB) return;
    
    try {
      // Use direct download for HTML content instead of JSON parsing
      downloadGET(
        `/api/releases_compare/compare?project_id=${projectId}&release_a=${releaseA}&release_b=${releaseB}&format=html`,
        `release-comparison-${releaseA}-vs-${releaseB}.html`
      );
    } catch (err) {
      console.error("Failed to export HTML comparison:", err);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="w-5 h-5" />
          Release Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Release A</label>
            <Select value={releaseA} onValueChange={setReleaseA}>
              <SelectTrigger data-testid="select-release-a">
                <SelectValue placeholder="Select first release" />
              </SelectTrigger>
              <SelectContent>
                {releases.map(release => (
                  <SelectItem key={release.id} value={release.id}>
                    {release.version} - {release.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Release B</label>
            <Select value={releaseB} onValueChange={setReleaseB}>
              <SelectTrigger data-testid="select-release-b">
                <SelectValue placeholder="Select second release" />
              </SelectTrigger>
              <SelectContent>
                {releases.map(release => (
                  <SelectItem key={release.id} value={release.id}>
                    {release.version} - {release.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={compareReleases} 
            disabled={!releaseA || !releaseB || loading}
            data-testid="button-compare"
          >
            {loading ? "Comparing..." : "Compare Releases"}
          </Button>
          <Button 
            variant="outline" 
            onClick={exportHtmlComparison}
            disabled={!releaseA || !releaseB}
            data-testid="button-export-comparison"
          >
            <Download className="w-4 h-4 mr-2" />
            Export HTML
          </Button>
        </div>
        
        {comparison && <ComparisonResults comparison={comparison} />}
      </CardContent>
    </Card>
  );
}

// Release Notes Generator Component  
function ReleaseNotesGenerator({ releases, projectId }: { releases: any[]; projectId: string }) {
  const [selectedRelease, setSelectedRelease] = useState<string>("");
  const [format, setFormat] = useState<string>("html");
  const [sections, setSections] = useState<string[]>(["features", "fixes", "breaking"]);
  const [notes, setNotes] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function generateNotes() {
    if (!selectedRelease) return;
    
    setLoading(true);
    try {
      const sectionsParam = sections.join("&include_sections=");
      const result = await getJSON(
        `/api/releases_compare/notes?project_id=${projectId}&release_id=${selectedRelease}&format=${format}&include_sections=${sectionsParam}`
      );
      setNotes(result);
    } catch (err) {
      console.error("Failed to generate release notes:", err);
      setNotes(null);
    } finally {
      setLoading(false);
    }
  }

  async function downloadNotes() {
    if (!notes || !selectedRelease) return;
    
    const content = format === "html" ? notes.html : notes.markdown;
    const mimeType = format === "html" ? "text/html" : "text/markdown";
    const extension = format === "html" ? "html" : "md";
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `release-notes-${selectedRelease}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const handleSectionChange = (section: string, checked: boolean) => {
    if (checked) {
      setSections(prev => [...prev, section]);
    } else {
      setSections(prev => prev.filter(s => s !== section));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Release Notes Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Release</label>
            <Select value={selectedRelease} onValueChange={setSelectedRelease}>
              <SelectTrigger data-testid="select-release-notes">
                <SelectValue placeholder="Select release" />
              </SelectTrigger>
              <SelectContent>
                {releases.map(release => (
                  <SelectItem key={release.id} value={release.id}>
                    {release.version} - {release.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Format</label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger data-testid="select-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="html">HTML</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Include Sections</label>
          <div className="flex gap-4">
            {[
              { id: "features", label: "Features" },
              { id: "fixes", label: "Bug Fixes" },
              { id: "breaking", label: "Breaking Changes" },
              { id: "other", label: "Other Changes" }
            ].map(section => (
              <label key={section.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sections.includes(section.id)}
                  onChange={(e) => handleSectionChange(section.id, e.target.checked)}
                  data-testid={`checkbox-${section.id}`}
                />
                <span className="text-sm">{section.label}</span>
              </label>
            ))}
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={generateNotes} 
            disabled={!selectedRelease || loading}
            data-testid="button-generate-notes"
          >
            {loading ? "Generating..." : "Generate Notes"}
          </Button>
          <Button 
            variant="outline" 
            onClick={downloadNotes}
            disabled={!notes}
            data-testid="button-download-notes"
          >
            <Download className="w-4 h-4 mr-2" />
            Download {format.toUpperCase()}
          </Button>
        </div>
        
        {notes && <NotesPreview notes={notes} format={format} />}
      </CardContent>
    </Card>
  );
}

// Release Diff Notes Component (Enhanced Diff Features)
function ReleaseDiffNotes({ releases, projectId }: { releases: any[]; projectId: string }) {
  const [baseRelease, setBaseRelease] = useState<string>("");
  const [targetRelease, setTargetRelease] = useState<string>("");
  const [diffNotes, setDiffNotes] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function generateDiffNotes() {
    if (!baseRelease || !targetRelease) return;
    
    setLoading(true);
    try {
      // Get both comparison and individual release notes
      const [comparison, baseNotes, targetNotes] = await Promise.all([
        getJSON(`/api/releases_compare/compare?project_id=${projectId}&release_a=${baseRelease}&release_b=${targetRelease}&format=json`),
        getJSON(`/api/releases_compare/notes?project_id=${projectId}&release_id=${baseRelease}&format=html`),
        getJSON(`/api/releases_compare/notes?project_id=${projectId}&release_id=${targetRelease}&format=html`)
      ]);
      
      setDiffNotes({
        comparison,
        baseNotes,
        targetNotes,
        summary: {
          base_release: baseRelease,
          target_release: targetRelease,
          changes_added: comparison.changes_summary?.added_count || 0,
          changes_removed: comparison.changes_summary?.removed_count || 0,
          changes_common: comparison.changes_summary?.common_count || 0,
          timeline_shift: comparison.timeline_diff?.planned_shift_days || 0
        }
      });
    } catch (err) {
      console.error("Failed to generate diff notes:", err);
      setDiffNotes(null);
    } finally {
      setLoading(false);
    }
  }

  async function exportDiffHtml() {
    if (!diffNotes) return;
    
    // Generate comprehensive diff HTML
    const html = generateDiffHtml(diffNotes);
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `release-diff-${baseRelease}-to-${targetRelease}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function openPrintView() {
    if (!diffNotes) return;
    
    // Generate print-optimized HTML
    const html = generatePrintReadyHtml(diffNotes);
    
    // Open in new window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      
      // Wait for content to load, then open print dialog
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="w-5 h-5" />
          Release Diff Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Base Release (From)</label>
            <Select value={baseRelease} onValueChange={setBaseRelease}>
              <SelectTrigger data-testid="select-base-release">
                <SelectValue placeholder="Select base release" />
              </SelectTrigger>
              <SelectContent>
                {releases.map(release => (
                  <SelectItem key={release.id} value={release.id}>
                    {release.version} - {release.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Release (To)</label>
            <Select value={targetRelease} onValueChange={setTargetRelease}>
              <SelectTrigger data-testid="select-target-release">
                <SelectValue placeholder="Select target release" />
              </SelectTrigger>
              <SelectContent>
                {releases.map(release => (
                  <SelectItem key={release.id} value={release.id}>
                    {release.version} - {release.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={generateDiffNotes} 
            disabled={!baseRelease || !targetRelease || loading}
            data-testid="button-generate-diff"
          >
            {loading ? "Generating..." : "Generate Diff Notes"}
          </Button>
          <Button 
            variant="outline" 
            onClick={openPrintView}
            disabled={!diffNotes}
            data-testid="button-print-view"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print View
          </Button>
          <Button 
            variant="outline" 
            onClick={exportDiffHtml}
            disabled={!diffNotes}
            data-testid="button-export-diff"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Diff HTML
          </Button>
        </div>
        
        {diffNotes && <DiffNotesPreview diffNotes={diffNotes} />}
      </CardContent>
    </Card>
  );
}

// Helper components
function ComparisonResults({ comparison }: { comparison: any }) {
  if (!comparison) return null;
  
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{comparison.release_a?.version || "Release A"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{comparison.release_a?.title || "N/A"}</p>
            <p className="text-sm">Status: {comparison.release_a?.status || "unknown"}</p>
            <p className="text-sm">Changes: {comparison.changes_summary?.total_a || 0}</p>
          </CardContent>
        </Card>
        
        <div className="flex items-center justify-center px-4">
          <Badge variant="outline">VS</Badge>
        </div>
        
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{comparison.release_b?.version || "Release B"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{comparison.release_b?.title || "N/A"}</p>
            <p className="text-sm">Status: {comparison.release_b?.status || "unknown"}</p>
            <p className="text-sm">Changes: {comparison.changes_summary?.total_b || 0}</p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Changes Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{comparison.changes_summary?.added_count || 0}</div>
              <div className="text-sm text-muted-foreground">Added</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{comparison.changes_summary?.removed_count || 0}</div>
              <div className="text-sm text-muted-foreground">Removed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{comparison.changes_summary?.common_count || 0}</div>
              <div className="text-sm text-muted-foreground">Common</div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {comparison.changes_added?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-green-600">Added Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangesList changes={comparison.changes_added} />
          </CardContent>
        </Card>
      )}
      
      {comparison.changes_removed?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-red-600">Removed Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangesList changes={comparison.changes_removed} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NotesPreview({ notes, format }: { notes: any; format: string }) {
  if (!notes) return null;
  
  // Simple HTML sanitization to prevent XSS
  function sanitizeHtml(html: string): string {
    // Allow basic formatting tags but strip script/style/etc
    const allowedTags = /<\/?(?:p|br|strong|b|em|i|u|h[1-6]|ul|ol|li|div|span|pre|code|blockquote)[^>]*>/gi;
    return html
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers
      .replace(/javascript:/gi, '')
      .replace(/<(?!\/?(p|br|strong|b|em|i|u|h[1-6]|ul|ol|li|div|span|pre|code|blockquote)\b)[^>]+>/gi, '');
  }
  
  if (format === "html" && notes.html) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>HTML Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            className="prose prose-sm max-w-none border rounded p-4"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(notes.html) }}
          />
        </CardContent>
      </Card>
    );
  }
  
  if (format === "markdown" && notes.markdown) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Markdown Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm bg-muted p-4 rounded overflow-auto">
            {notes.markdown}
          </pre>
        </CardContent>
      </Card>
    );
  }
  
  if (notes.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">{notes.error}</p>
        </CardContent>
      </Card>
    );
  }
  
  return null;
}

function DiffNotesPreview({ diffNotes }: { diffNotes: any }) {
  if (!diffNotes) return null;
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Diff Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-green-600">{diffNotes.summary?.changes_added || 0}</div>
              <div className="text-sm text-muted-foreground">Added</div>
            </div>
            <div>
              <div className="text-xl font-bold text-red-600">{diffNotes.summary?.changes_removed || 0}</div>
              <div className="text-sm text-muted-foreground">Removed</div>
            </div>
            <div>
              <div className="text-xl font-bold text-blue-600">{diffNotes.summary?.changes_common || 0}</div>
              <div className="text-sm text-muted-foreground">Common</div>
            </div>
            <div>
              <div className="text-xl font-bold">{diffNotes.summary?.timeline_shift || 0}</div>
              <div className="text-sm text-muted-foreground">Days Shift</div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {diffNotes.comparison && <ComparisonResults comparison={diffNotes.comparison} />}
    </div>
  );
}

function ChangesList({ changes }: { changes: any[] }) {
  if (!changes || changes.length === 0) {
    return <p className="text-sm text-muted-foreground">No changes</p>;
  }
  
  return (
    <div className="space-y-2">
      {changes.map((change, index) => (
        <div key={index} className="flex items-center justify-between p-2 border rounded">
          <div>
            <div className="font-medium text-sm">{change.title || "Untitled"}</div>
            <div className="text-xs text-muted-foreground">
              {change.area && <span className="mr-2">{change.area}</span>}
              {change.assignee && <span>@{change.assignee}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">{change.status || "unknown"}</Badge>
            <Badge variant="outline" className="text-xs">{change.priority || "medium"}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function generatePrintReadyHtml(diffNotes: any): string {
  if (!diffNotes) {
    throw new Error("No diff notes data provided");
  }
  
  const { comparison = {}, summary = {} } = diffNotes;
  const safeTitle = (summary.base_release || "Unknown") + " → " + (summary.target_release || "Unknown");
  
  // Safe access with defaults
  const changesAdded = comparison.changes_added || [];
  const changesRemoved = comparison.changes_removed || [];
  const summaryStats = {
    added: summary.changes_added || 0,
    removed: summary.changes_removed || 0,
    common: summary.changes_common || 0,
    shift: summary.timeline_shift || 0
  };
  
  function escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Release Diff: ${escapeHtml(safeTitle)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px;
        }
        
        /* Print-specific styles */
        @media print {
            body { 
                margin: 0; 
                padding: 15mm; 
                font-size: 12pt; 
                line-height: 1.4;
                color: #000 !important;
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
            }
            .page-break { page-break-before: always; }
            .no-break { break-inside: avoid; }
            .header { margin-bottom: 20pt; }
            .summary { margin-bottom: 20pt; }
            .changes-section { margin-bottom: 15pt; }
            .change-item { margin-bottom: 8pt; break-inside: avoid; }
            h1 { font-size: 18pt; margin-bottom: 10pt; }
            h2 { font-size: 16pt; margin-bottom: 8pt; }
            h3 { font-size: 14pt; margin-bottom: 6pt; }
        }
        
        .header { 
            text-align: center; 
            margin-bottom: 40px; 
            border-bottom: 2px solid #e0e0e0; 
            padding-bottom: 20px; 
        }
        .header h1 { color: #1a202c; font-size: 28px; margin-bottom: 10px; }
        .header h2 { color: #4a5568; font-size: 20px; font-weight: normal; }
        
        .summary { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 20px; 
            margin-bottom: 40px; 
        }
        .summary-card { 
            padding: 20px; 
            border: 1px solid #e0e0e0; 
            border-radius: 8px; 
            text-align: center; 
            background: #f7fafc;
        }
        .summary-card .number { font-size: 32px; font-weight: bold; margin-bottom: 5px; }
        .summary-card .label { font-size: 14px; color: #4a5568; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .added { color: #22c55e !important; }
        .removed { color: #ef4444 !important; }
        .common { color: #3b82f6 !important; }
        
        .changes-section { 
            margin-bottom: 30px; 
            border-left: 4px solid #e0e0e0; 
            padding-left: 20px; 
        }
        .changes-section.added-section { border-left-color: #22c55e; }
        .changes-section.removed-section { border-left-color: #ef4444; }
        
        .changes-section h3 { 
            margin-bottom: 15px; 
            font-size: 20px; 
            display: flex; 
            align-items: center; 
            gap: 10px; 
        }
        
        .change-item { 
            padding: 12px 16px; 
            margin-bottom: 12px; 
            border: 1px solid #e0e0e0; 
            border-radius: 6px; 
            background: #fff;
        }
        .change-item.added { 
            border-left: 4px solid #22c55e; 
            background-color: #f0fdf4; 
        }
        .change-item.removed { 
            border-left: 4px solid #ef4444; 
            background-color: #fef2f2; 
        }
        
        .change-title { font-weight: 600; font-size: 16px; margin-bottom: 5px; color: #1a202c; }
        .change-meta { font-size: 13px; color: #6b7280; }
        .change-meta span { margin-right: 15px; }
        
        .timestamp { 
            text-align: center; 
            margin-top: 40px; 
            padding-top: 20px; 
            border-top: 1px solid #e0e0e0; 
            color: #6b7280; 
            font-size: 14px; 
        }
        
        .error { 
            color: #ef4444; 
            background-color: #fef2f2; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0; 
            border: 1px solid #fecaca; 
        }
        
        @media screen {
            .print-only { display: none; }
        }
        
        @media print {
            .screen-only { display: none; }
            .print-only { display: block; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Release Diff Notes</h1>
        <h2>${escapeHtml(safeTitle)}</h2>
        <div class="print-only" style="font-size: 12px; color: #666; margin-top: 10px;">
            Generated on ${new Date().toLocaleString()}
        </div>
    </div>
    
    <div class="summary no-break">
        <div class="summary-card">
            <div class="number added">${summaryStats.added}</div>
            <div class="label">Changes Added</div>
        </div>
        <div class="summary-card">
            <div class="number removed">${summaryStats.removed}</div>
            <div class="label">Changes Removed</div>
        </div>
        <div class="summary-card">
            <div class="number common">${summaryStats.common}</div>
            <div class="label">Common Changes</div>
        </div>
        <div class="summary-card">
            <div class="number">${summaryStats.shift}</div>
            <div class="label">Timeline Shift (days)</div>
        </div>
    </div>
    
    ${changesAdded.length > 0 ? `
    <div class="changes-section added-section">
        <h3 class="added">✅ Added Changes (${changesAdded.length})</h3>
        ${changesAdded.map((change: any) => `
        <div class="change-item added no-break">
            <div class="change-title">${escapeHtml(change.title || 'Untitled')}</div>
            <div class="change-meta">
                <span><strong>Area:</strong> ${escapeHtml(change.area || 'N/A')}</span>
                <span><strong>Status:</strong> ${escapeHtml(change.status || 'unknown')}</span>
                <span><strong>Assignee:</strong> @${escapeHtml(change.assignee || 'unassigned')}</span>
                ${change.priority ? `<span><strong>Priority:</strong> ${escapeHtml(change.priority)}</span>` : ''}
            </div>
        </div>
        `).join('')}
    </div>
    ` : ''}
    
    ${changesRemoved.length > 0 ? `
    <div class="changes-section removed-section">
        <h3 class="removed">❌ Removed Changes (${changesRemoved.length})</h3>
        ${changesRemoved.map((change: any) => `
        <div class="change-item removed no-break">
            <div class="change-title">${escapeHtml(change.title || 'Untitled')}</div>
            <div class="change-meta">
                <span><strong>Area:</strong> ${escapeHtml(change.area || 'N/A')}</span>
                <span><strong>Status:</strong> ${escapeHtml(change.status || 'unknown')}</span>
                <span><strong>Assignee:</strong> @${escapeHtml(change.assignee || 'unassigned')}</span>
                ${change.priority ? `<span><strong>Priority:</strong> ${escapeHtml(change.priority)}</span>` : ''}
            </div>
        </div>
        `).join('')}
    </div>
    ` : ''}
    
    ${(!changesAdded.length && !changesRemoved.length) ? `
    <div class="error">
        <h3>No Changes Found</h3>
        <p>No differences were detected between the selected releases. This could indicate:</p>
        <ul style="margin-left: 20px; margin-top: 10px;">
            <li>The releases are identical</li>
            <li>The comparison data could not be loaded</li>
            <li>There was an error in the comparison process</li>
        </ul>
    </div>
    ` : ''}
    
    <div class="timestamp screen-only">
        Generated on ${new Date().toLocaleString()}
    </div>
</body>
</html>
  `.trim();
}

function generateDiffHtml(diffNotes: any): string {
  if (!diffNotes) {
    throw new Error("No diff notes data provided");
  }
  
  const { comparison = {}, summary = {} } = diffNotes;
  const safeTitle = (summary.base_release || "Unknown") + " → " + (summary.target_release || "Unknown");
  
  // Safe access with defaults
  const changesAdded = comparison.changes_added || [];
  const changesRemoved = comparison.changes_removed || [];
  const summaryStats = {
    added: summary.changes_added || 0,
    removed: summary.changes_removed || 0,
    common: summary.changes_common || 0,
    shift: summary.timeline_shift || 0
  };
  
  function escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  
  function renderChange(change: any): string {
    return `
        <div class="change-item">
            <strong>${escapeHtml(change.title || 'Untitled')}</strong><br>
            <small>${escapeHtml(change.area || '')} • ${escapeHtml(change.status || 'unknown')} • @${escapeHtml(change.assignee || 'unassigned')}</small>
        </div>`;
  }
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Release Diff: ${escapeHtml(safeTitle)}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 40px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .summary-card { padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; text-align: center; }
        .added { color: #22c55e; }
        .removed { color: #ef4444; }
        .common { color: #3b82f6; }
        .changes-section { margin-bottom: 30px; }
        .change-item { padding: 10px; border-left: 4px solid #e0e0e0; margin-bottom: 10px; }
        .change-item.added { border-left-color: #22c55e; background-color: #f0fdf4; }
        .change-item.removed { border-left-color: #ef4444; background-color: #fef2f2; }
        .timestamp { text-align: center; margin-top: 40px; color: #666; font-size: 14px; }
        .error { color: #ef4444; background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Release Diff Notes</h1>
        <h2>${escapeHtml(safeTitle)}</h2>
    </div>
    
    <div class="summary">
        <div class="summary-card">
            <div class="added" style="font-size: 24px; font-weight: bold;">${summaryStats.added}</div>
            <div>Changes Added</div>
        </div>
        <div class="summary-card">
            <div class="removed" style="font-size: 24px; font-weight: bold;">${summaryStats.removed}</div>
            <div>Changes Removed</div>
        </div>
        <div class="summary-card">
            <div class="common" style="font-size: 24px; font-weight: bold;">${summaryStats.common}</div>
            <div>Common Changes</div>
        </div>
        <div class="summary-card">
            <div style="font-size: 24px; font-weight: bold;">${summaryStats.shift}</div>
            <div>Timeline Shift (days)</div>
        </div>
    </div>
    
    ${changesAdded.length > 0 ? `
    <div class="changes-section">
        <h3 class="added">Added Changes (${changesAdded.length})</h3>
        ${changesAdded.map((change: any) => `
        <div class="change-item added">
            <strong>${escapeHtml(change.title || 'Untitled')}</strong><br>
            <small>${escapeHtml(change.area || '')} • ${escapeHtml(change.status || 'unknown')} • @${escapeHtml(change.assignee || 'unassigned')}</small>
        </div>
        `).join('')}
    </div>
    ` : ''}
    
    ${changesRemoved.length > 0 ? `
    <div class="changes-section">
        <h3 class="removed">Removed Changes (${changesRemoved.length})</h3>
        ${changesRemoved.map((change: any) => `
        <div class="change-item removed">
            <strong>${escapeHtml(change.title || 'Untitled')}</strong><br>
            <small>${escapeHtml(change.area || '')} • ${escapeHtml(change.status || 'unknown')} • @${escapeHtml(change.assignee || 'unassigned')}</small>
        </div>
        `).join('')}
    </div>
    ` : ''}
    
    ${(!changesAdded.length && !changesRemoved.length) ? `
    <div class="error">
        <h3>No Changes Found</h3>
        <p>No differences were detected between the selected releases. This could indicate:</p>
        <ul>
            <li>The releases are identical</li>
            <li>The comparison data could not be loaded</li>
            <li>There was an error in the comparison process</li>
        </ul>
    </div>
    ` : ''}
    
    <div class="timestamp">
        Generated on ${new Date().toLocaleString()}
    </div>
</body>
</html>
  `.trim();
}