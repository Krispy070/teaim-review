import { Card } from "../../components/ui/Card";

export function WellnessCard({className=""}:{className?:string}) {
  const trend = [70,72,68,75,78,80]; // mock
  return (
    <Card title="Team Wellness" >
      <div className="flex items-end justify-between">
        <div>
          <div className="text-4xl font-semibold text-success">Good</div>
          <div className="text-sm text-muted mt-1">↑ improving this week</div>
        </div>
        <Sparkline data={trend}/>
      </div>
      <div className="mt-4 flex gap-2">
        {["😊","😐","😟"].map(e=>(
          <button key={e} className="px-3 py-1 rounded-lg border border-border bg-panel hover:bg-panelc">{e}</button>
        ))}
      </div>
    </Card>
  );
}

function Sparkline({data}:{data:number[]}) {
  // Simple CSS sparkline – replace with chart lib later
  const max = Math.max(...data);
  const pts = data.map((v,i)=>`${(i/(data.length-1))*100},${100 - (v/max)*100}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" className="h-16 w-32">
      <polyline fill="none" stroke="hsl(var(--success))" strokeWidth="3" points={pts}/>
    </svg>
  );
}