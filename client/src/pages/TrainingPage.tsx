import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import { getProjectId } from "@/lib/project";
import { authFetch } from "@/lib/authFetch";
import { useEffect, useMemo, useState } from "react";
import { useUserRole, canEdit } from "@/lib/role";

type Row = {
  id:string; module?:string; workstream?:string; phase?:string; topic:string;
  delivery?:string; hours?:number; audience?:string; owner?:string; status?:string;
  startAt?:string; endAt?:string; locationUrl?:string; prereqs?:string;
  resourcesUrl?:string; notes?:string;
};

export default function TrainingPage(){
  const pid = getProjectId();
  const userRole = useUserRole();
  const readonly = !canEdit(userRole);
  const [rows,setRows] = useState<Row[]>([]);
  const [msg,setMsg] = useState("");
  const [tab,setTab] = useState<"grid"|"calendar">("grid");

  async function load(){
    const r = await authFetch(`/api/training/plan?projectId=${encodeURIComponent(pid!)}`);
    const j = await r.json(); setRows(j.items||[]);
  }
  useEffect(()=>{ if(pid) load(); },[pid]);

  async function patch(id:string, body:Partial<Row>){
    const r = await authFetch(`/api/training/plan/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    setMsg(r.ok?"Saved":"Save failed"); setTimeout(()=>setMsg(""),800);
    load();
  }

  async function doImport(e:React.ChangeEvent<HTMLInputElement>){
    const f = e.currentTarget.files?.[0]; if(!f) return;
    const fd = new FormData(); fd.append("file", f); fd.append("projectId", pid!);
    const r = await authFetch(`/api/training/import`, { method:"POST", body: fd });
    const j = await r.json(); setMsg(r.ok?`Imported ${j.inserted}`:"Import failed"); setTimeout(()=>setMsg(""),2000);
    e.currentTarget.value = ""; load();
  }

  return (
    <AppFrame sidebar={<SidebarV2/>}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Training Plan</h1>
          <div className="flex items-center gap-2">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={doImport} className="text-xs" data-testid="button-import" />
            <a className="text-xs px-2 py-1 border rounded-lg" href={`/api/training/export.csv?projectId=${encodeURIComponent(pid!)}`} data-testid="link-export-csv">Export CSV</a>
            <a className="text-xs px-2 py-1 border rounded-lg" href={`/api/training/plan.ics?projectId=${encodeURIComponent(pid!)}`} target="_blank" rel="noreferrer" data-testid="link-export-ics">Download ICS</a>
            <button className={`text-xs px-2 py-1 border rounded-lg ${tab==="grid"?"bg-slate-800":""}`} onClick={()=>setTab("grid")} data-testid="tab-grid">GRID</button>
            <button className={`text-xs px-2 py-1 border rounded-lg ${tab==="calendar"?"bg-slate-800":""}`} onClick={()=>setTab("calendar")} data-testid="tab-calendar">CALENDAR</button>
          </div>
        </div>
        <div className="text-xs opacity-70">{msg}</div>

        {tab==="grid" ? <Grid rows={rows} patch={patch} reload={load} readonly={readonly} />
                      : <Calendar rows={rows} patch={patch} />}

        {tab==="grid" && (
          <div className="text-[11px] opacity-60">
            Import expects either "<code>Course List (original)</code>" with <code>Training Title</code>, <code>Delivery Method/Training Type</code>, <code>Pillar</code>, <code>Hours</code>,
            or "<code>Data</code>" with <code>[formatFlag, Title, Delivery, Phase, Hours]</code>.
          </div>
        )}
      </div>
    </AppFrame>
  );
}

/* ---------- GRID ---------- */
function Grid({rows,patch,reload,readonly=false}:{rows:Row[]; patch:(id:string,b:Partial<Row>)=>void; reload:()=>void; readonly?:boolean}){
  const pid = getProjectId();
  const [selected, setSelected] = useState<Record<string,boolean>>({});
  const [owner,setOwner] = useState("");
  const [status,setStatus] = useState("planned");

  const cols:(keyof Row)[] = ["module","workstream","phase","topic","delivery","hours","audience","owner","status","startAt","endAt","locationUrl","prereqs","resourcesUrl","notes"];
  const label:Record<string,string> = {
    module:"Module", workstream:"Workstream", phase:"Phase", topic:"Topic", delivery:"Delivery",
    hours:"Hours", audience:"Audience", owner:"Owner", status:"Status",
    startAt:"Start", endAt:"End", locationUrl:"Location/Link", prereqs:"Prereqs",
    resourcesUrl:"Resources", notes:"Notes"
  };
  const ids = Object.keys(selected).filter(k=>selected[k]);

  async function bulkUpdate(){
    if (!ids.length) return;
    const body:any = { projectId: pid, ids };
    if (owner) body.owner = owner;
    if (status) body.status = status;
    await authFetch(`/api/training/bulk-update`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    setSelected({}); setOwner(""); setStatus("planned");
    reload();
  }

  async function bulkSchedule(){
    if (!ids.length) return;
    const baseDate = prompt("Base date (YYYY-MM-DD, UTC start-of-day)? e.g. 2026-01-15","") || "";
    if (!baseDate) return;
    const phaseOffsets = prompt("Phase offsets JSON (e.g. {\"Architect & Configure - Deploy\": 7, \"Testing\": 30})","{}");
    const moduleOffsets = prompt("Module offsets JSON (e.g. {\"HCM\": 0, \"Payroll\": 5, \"FIN\": 10})","{}");
    const defaultStartHour = Number(prompt("Default start hour (UTC 0..23)?","17") || "17");
    const defaultDurationHours = Number(prompt("Default duration hours?","2") || "2");
    const body = {
      projectId: pid, ids, baseDate,
      phaseOffsets: JSON.parse(phaseOffsets||"{}"),
      moduleOffsets: JSON.parse(moduleOffsets||"{}"),
      defaultStartHour, defaultDurationHours
    };
    await authFetch(`/api/training/bulk-schedule`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    setSelected({});
    reload();
  }

  const cell = (it:Row, k:keyof Row)=>{
    const v:any = (it as any)[k] ?? "";
    const type = (k==="startAt"||k==="endAt") ? "datetime-local" : (k==="hours" ? "number":"text");
    const val = (():string=>{
      if ((k==="startAt"||k==="endAt") && v) return String(v).slice(0,16);
      return String(v);
    })();
    return (
      <input
        className="w-full bg-transparent border-b border-transparent focus:border-slate-500 px-1 py-0.5 text-sm disabled:opacity-60"
        type={type}
        defaultValue={val}
        disabled={readonly}
        onBlur={e=>{
          if(readonly) return;
          const newV = e.target.value; if (newV===val) return;
          const payload:any = {};
          if (k==="hours") payload[k]=Number(newV||0);
          else if (k==="startAt"||k==="endAt") payload[k]= newV ? new Date(newV).toISOString() : null;
          else payload[k]= newV || null;
          patch(it.id, payload);
        }}
        data-testid={`input-${it.id}-${String(k)}`}
      />
    );
  };

  return (
    <>
      {/* Bulk toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs opacity-70">Selected: {ids.length}</span>
        <input className="border rounded px-2 py-1 text-sm" placeholder="owner…" value={owner} onChange={e=>setOwner(e.target.value)} data-testid="input-bulk-owner" />
        <select className="border rounded px-2 py-1 text-sm" value={status} onChange={e=>setStatus(e.target.value)} data-testid="select-bulk-status">
          <option value="planned">planned</option>
          <option value="scheduled">scheduled</option>
          <option value="done">done</option>
        </select>
        <button className="text-xs px-2 py-1 border rounded-lg" onClick={bulkUpdate} disabled={!ids.length} data-testid="button-bulk-update">Update owner/status</button>
        <button className="text-xs px-2 py-1 border rounded-lg" onClick={bulkSchedule} disabled={!ids.length} data-testid="button-bulk-schedule">Bulk schedule…</button>
      </div>

      <div className="overflow-auto">
        <table className="min-w-[1100px] w-full text-sm border-separate border-spacing-y-1">
          <thead><tr className="text-xs opacity-70">
            <th className="px-2 py-1"><input type="checkbox" onChange={e=>{
              const all = e.target.checked;
              const next:Record<string,boolean> = {}; rows.forEach(r=> next[r.id]=all);
              setSelected(next);
            }} data-testid="checkbox-select-all" /></th>
            {cols.map(c => <th key={c} className="text-left px-2 py-1">{label[c]}</th>)}
          </tr></thead>
          <tbody>
          {rows.map(it=>(
            <tr key={it.id} className="bg-slate-900/40 border rounded-xl" data-testid={`row-${it.id}`}>
              <td className="px-2 py-1"><input type="checkbox" checked={!!selected[it.id]} onChange={e=> setSelected(s=>({...s,[it.id]:e.target.checked}))} data-testid={`checkbox-${it.id}`} /></td>
              {cols.map(c => <td key={String(c)} className="px-2 py-1">{cell(it,c)}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td className="opacity-70 text-sm px-2 py-2" colSpan={15}>No rows yet. Import the planner (.xlsx) to seed the plan.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- CALENDAR ---------- */
function Calendar({rows,patch}:{rows:Row[]; patch:(id:string,b:Partial<Row>)=>void}){
  const [mode,setMode] = useState<"month"|"week">("month");
  const [cursor,setCursor] = useState(new Date());

  const events = useMemo(()=> rows.filter(r=>r.startAt).map(r=>{
    const start = new Date(r.startAt!);
    const end = r.endAt ? new Date(r.endAt) : new Date(start.getTime() + ((r.hours||1)*60*60*1000));
    const durMs = end.getTime() - start.getTime();
    return {
      id:r.id, title:r.topic, module:r.module, start, end,
      owner:r.owner, link:r.locationUrl, durMs
    };
  }),[rows]);

  function addDay(d:Date, n:number){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

  // Called by Month/Week grids after a successful drop
  async function onDropReschedule(ev:{id:string; toDate:Date}){
    const evObj = events.find(e=>e.id===ev.id);
    if (!evObj) return;
    // Keep original HH:MM and duration
    const hh = evObj.start.getHours(), mm = evObj.start.getMinutes();
    const newStart = new Date(ev.toDate.getFullYear(), ev.toDate.getMonth(), ev.toDate.getDate(), hh, mm, 0);
    const newEnd   = new Date(newStart.getTime() + evObj.durMs);
    await patch(ev.id, { startAt: newStart.toISOString(), endAt: newEnd.toISOString(), status: "scheduled" });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>setCursor(addDay(cursor, mode==="month"?-30:-7))} data-testid="button-prev">◀</button>
        <div className="text-sm">{cursor.toLocaleString(undefined,{ month:"long", year:"numeric"})} ({mode})</div>
        <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>setCursor(addDay(cursor, mode==="month"?30:7))} data-testid="button-next">▶</button>
        <button className={`text-xs px-2 py-1 border rounded-lg ${mode==="month"?"bg-slate-800":""}`} onClick={()=>setMode("month")} data-testid="button-month">Month</button>
        <button className={`text-xs px-2 py-1 border rounded-lg ${mode==="week"?"bg-slate-800":""}`} onClick={()=>setMode("week")} data-testid="button-week">Week</button>
      </div>

      {mode==="month"
        ? <MonthGrid cursor={cursor} events={events} onDropReschedule={onDropReschedule} />
        : <WeekGrid  cursor={cursor} events={events} onDropReschedule={onDropReschedule} />}
    </div>
  );
}

function MonthGrid({cursor, events, onDropReschedule}:{cursor:Date; events:any[]; onDropReschedule:(e:{id:string; toDate:Date})=>void}){
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay()); // sunday start
  const cells = Array.from({length:42},(_,i)=> new Date(start.getFullYear(), start.getMonth(), start.getDate()+i));
  function sameDay(a:Date,b:Date){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

  function onDragStart(e:React.DragEvent, ev:any){
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: ev.id, from: ev.start.toISOString(), durMs: ev.durMs }));
    e.dataTransfer.effectAllowed = "move";
  }
  function allowDrop(e:React.DragEvent){ e.preventDefault(); e.dataTransfer.dropEffect="move"; }

  return (
    <div className="grid grid-cols-7 gap-2">
      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} className="text-xs opacity-70">{d}</div>)}
      {cells.map(d=>{
        const dayEvents = events.filter(e=> sameDay(e.start,d));
        const dim = d.getMonth()!==cursor.getMonth();
        return (
          <div
            key={d.toISOString()}
            className={`min-h-[120px] p-2 border rounded-2xl ${dim?"opacity-50":""}`}
            onDragOver={allowDrop}
            onDrop={(e)=>{
              try {
                const payload = JSON.parse(e.dataTransfer.getData("text/plain"));
                onDropReschedule({ id: payload.id, toDate: d });
              } catch {}
            }}
            data-testid={`day-${d.toISOString().slice(0,10)}`}
          >
            <div className="text-xs opacity-70">{d.getDate()}</div>
            <div className="mt-1 space-y-1">
              {dayEvents.map(e=>(
                <div
                  key={e.id}
                  draggable
                  onDragStart={(ev)=>onDragStart(ev,e)}
                  className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-grab"
                  title={`${e.title}${e.owner?` • ${e.owner}`:""}`}
                  data-testid={`event-${e.id}`}
                >
                  {(e.module?`[${e.module}] `:"")}{e.title}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({cursor, events, onDropReschedule}:{cursor:Date; events:any[]; onDropReschedule:(e:{id:string; toDate:Date})=>void}){
  const start = new Date(cursor); start.setDate(start.getDate()-start.getDay());
  const days = Array.from({length:7},(_,i)=> new Date(start.getFullYear(), start.getMonth(), start.getDate()+i));
  function sameDay(a:Date,b:Date){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

  function onDragStart(e:React.DragEvent, ev:any){
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: ev.id, from: ev.start.toISOString(), durMs: ev.durMs }));
    e.dataTransfer.effectAllowed = "move";
  }
  function allowDrop(e:React.DragEvent){ e.preventDefault(); e.dataTransfer.dropEffect="move"; }

  return (
    <div>
      <div className="grid grid-cols-7 gap-2 mb-2">
        {days.map(d=><div key={d.toISOString()} className="text-xs opacity-70">{d.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map(d=>{
          const dayEvents = events.filter(e=> sameDay(e.start,d));
          return (
            <div
              key={d.toISOString()}
              className="min-h-[140px] p-2 border rounded-2xl"
              onDragOver={allowDrop}
              onDrop={(e)=>{
                try {
                  const payload = JSON.parse(e.dataTransfer.getData("text/plain"));
                  onDropReschedule({ id: payload.id, toDate: d });
                } catch {}
              }}
              data-testid={`day-${d.toISOString().slice(0,10)}`}
            >
              <div className="space-y-1">
                {dayEvents.map(e=>(
                  <div
                    key={e.id}
                    draggable
                    onDragStart={(ev)=>onDragStart(ev,e)}
                    className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-grab"
                    title={`${e.title}${e.owner?` • ${e.owner}`:""}`}
                    data-testid={`event-${e.id}`}
                  >
                    {(e.module?`[${e.module}] `:"")}{e.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
