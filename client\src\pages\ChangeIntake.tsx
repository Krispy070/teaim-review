import { useState } from "react";
import { useParams } from "react-router-dom";
import { postJSON } from "@/lib/authFetch";
import PageHeading from "@/components/PageHeading";

export default function ChangeIntake(){
  const { projectId } = useParams();
  const [f,setF]=useState({ title:"", area:"", description:"", priority:"medium", risk:"medium", assignee:"", due_date:"" });
  async function submit(){
    if (!f.title.trim()) return alert("Title required");
    await postJSON(`/api/changes/upsert?project_id=${projectId}`, { ...f, status:"intake", watchers:[] });
    alert("Change submitted"); setF({ title:"", area:"", description:"", priority:"medium", risk:"medium", assignee:"", due_date:"" });
  }
  return (
    <div>
      <PageHeading title="Change Request — Intake" crumbs={[{label:"Execution"},{label:"Changes"}]} />
      <div className="brand-card p-3 grid md:grid-cols-2 gap-2">
        <input 
          className="border rounded p-2" 
          placeholder="Title" 
          value={f.title} 
          onChange={e=>setF({...f,title:e.target.value})}
          data-testid="input-title"
        />
        <input 
          className="border rounded p-2" 
          placeholder="Area (e.g., HCM)" 
          value={f.area} 
          onChange={e=>setF({...f,area:e.target.value})}
          data-testid="input-area"
        />
        <textarea 
          className="border rounded p-2 md:col-span-2" 
          rows={4} 
          placeholder="Description" 
          value={f.description} 
          onChange={e=>setF({...f,description:e.target.value})}
          data-testid="textarea-description"
        />
        <select 
          className="border rounded p-2" 
          value={f.priority} 
          onChange={e=>setF({...f,priority:e.target.value})}
          data-testid="select-priority"
        >
          {["low","medium","high","urgent"].map(x=><option key={x} value={x}>{x}</option>)}
        </select>
        <select 
          className="border rounded p-2" 
          value={f.risk} 
          onChange={e=>setF({...f,risk:e.target.value})}
          data-testid="select-risk"
        >
          {["low","medium","high"].map(x=><option key={x} value={x}>{x}</option>)}
        </select>
        <input 
          className="border rounded p-2" 
          placeholder="Assignee (email)" 
          value={f.assignee} 
          onChange={e=>setF({...f,assignee:e.target.value})}
          data-testid="input-assignee"
        />
        <input 
          type="date" 
          className="border rounded p-2" 
          value={f.due_date} 
          onChange={e=>setF({...f,due_date:e.target.value})}
          data-testid="input-due-date"
        />
        <div className="md:col-span-2 flex justify-end">
          <button 
            className="brand-btn text-xs swoosh" 
            onClick={submit}
            data-testid="button-submit"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}