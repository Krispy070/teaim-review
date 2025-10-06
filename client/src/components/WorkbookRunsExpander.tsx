import { useEffect, useState } from "react";
import { getJSON, postJSON } from "@/lib/authFetch";

export default function WorkbookRunsExpander({projectId, workbookId}:{projectId:string; workbookId:string}){
  const [items,setItems]=useState<any[]>([]);
  const [sum,setSum]=useState<any>({counts:{pulled:0,validated:0,loaded:0,failed:0}});

  async function load(){
    try{
      const r = await getJSON(`/api/workbooks/runs?workbook_id=${workbookId}`);
      setItems(r.items||[]);
    }catch{ setItems([]); }
    try{
      const s = await getJSON(`/api/workbooks/runs/summary?workbook_id=${workbookId}`);
      setSum(s||{counts:{pulled:0,validated:0,loaded:0,failed:0}});
    }catch{}
  }
  useEffect(()=>{ load(); },[workbookId]);

  async function upd(run_no:number, status:string, rows?:number){
    await postJSON(`/api/workbooks/runs/update?project_id=${projectId}&workbook_id=${workbookId}&run_no=${run_no}&status=${encodeURIComponent(status)}${rows!=null?`&rows=${rows}`:""}`, {});
    load();
  }
  async function del(run_no:number){
    await postJSON(`/api/workbooks/runs/delete?project_id=${projectId}&workbook_id=${workbookId}&run_no=${run_no}`, {});
    load();
  }

  return (
    <div className="border rounded p-2 mt-1">
      <div className="text-xs text-muted-foreground mb-1">Pipeline: pulled {sum.counts?.pulled} · validated {sum.counts?.validated} · loaded {sum.counts?.loaded} · failed {sum.counts?.failed}</div>
      <table className="w-full text-xs">
        <thead><tr><th className="text-left p-1">Run</th><th className="text-left p-1">Pulled on</th><th className="text-left p-1">Rows</th><th className="text-left p-1">Status</th><th></th></tr></thead>
        <tbody>
          {(items||[]).map((r:any)=>(
            <tr key={r.run_no}>
              <td className="p-1">{r.run_no}</td>
              <td className="p-1">{r.pulled_on || "—"}</td>
              <td className="p-1">
                <input className="border rounded p-1 w-[80px]" defaultValue={r.rows||0}
                       onBlur={e=>upd(r.run_no, r.status, parseInt(e.target.value||"0",10))}/>
              </td>
              <td className="p-1">
                <select className="border rounded p-1" value={r.status||"pulled"} onChange={e=>upd(r.run_no, e.target.value, r.rows)}>
                  {["pulled","validated","loaded","failed"].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td className="p-1"><button className="underline" onClick={()=>del(r.run_no)}>Delete</button></td>
            </tr>
          ))}
          {!items.length && <tr><td className="p-2 text-muted-foreground" colSpan={5}>No runs yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}