import { useEffect, useState } from "react";
import { subscribeToasts, dismissToast } from "@/lib/toast";

export default function ToastViewport(){
  const [list,setList]=useState<any[]>([]);
  useEffect(()=> subscribeToasts(setList),[]);
  const bg = (t:string)=> t==="error" ? "bg-red-900/90 border-red-600"
                    : t==="warn" ? "bg-amber-900/90 border-amber-600"
                    : t==="success" ? "bg-emerald-900/90 border-emerald-600"
                    : "bg-slate-900/90 border-slate-600";
  return (
    <div className="fixed bottom-3 right-3 z-[60] space-y-2" data-testid="toast-viewport">
      {list.map(t=>(
        <div key={t.id} className={`text-xs px-3 py-2 border rounded shadow ${bg(t.type)}`} data-testid={`toast-${t.type}`}>
          <div className="flex items-center gap-2">
            <span data-testid="toast-message">{t.message}</span>
            <button className="opacity-70 hover:opacity-100" onClick={()=>dismissToast(t.id)} data-testid="button-dismiss-toast" aria-label="Dismiss">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
