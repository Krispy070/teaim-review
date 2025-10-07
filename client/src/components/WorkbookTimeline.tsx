export default function WorkbookTimeline({start, end, runs}:{start?:string; end?:string; runs?:{run_no:number;status:string}[]}){
  if (!start || !end) return <div className="text-xs text-muted-foreground">No dates</div>;
  const s = new Date(start+"T00:00:00"), e = new Date(end+"T00:00:00");
  const total = Math.max(1, Math.round((+e - +s)/86400000));
  // place runs roughly (assumes pulled_on ~ evenly spaced)
  return (
    <div className="h-2 bg-white/10 rounded relative">
      <div className="absolute h-2 rounded bg-[var(--brand-accent)]" style={{ left:'0%', width:'100%' }}/>
      {(runs||[]).map(r=>{
        const left = Math.min(98, Math.max(0, (r.run_no/(Math.max(1, (runs||[]).length+1)))*100));
        const col = r.status==="loaded" ? "var(--brand-good)" : r.status==="validated" ? "#19d492" : r.status==="failed" ? "#ef4444" : "#6b7280";
        return <div key={r.run_no} className="absolute -top-1 w-[6px] h-[6px] rounded-full" title={`Run ${r.run_no} • ${r.status}`} style={{ left:`${left}%`, background: col }} />;
      })}
    </div>
  );
}