import { useEffect, useState } from "react";
import { subscribeToasts } from "@/lib/toast";

export default function ToastHost(){
  const [items,setItems]=useState<{id:string;type:string;message:string;timeout?:number}[]>([]);
  useEffect(()=> subscribeToasts((list)=> setItems(list)),[]);
  const map:any = { info:"border-sky-600 text-sky-300", error:"border-red-600 text-red-300", success:"border-emerald-600 text-emerald-300", warn:"border-amber-600 text-amber-300" };
  return (
    <div className="fixed right-3 bottom-3 z-[1000] space-y-2">
      {items.map(t=>(
        <div key={t.id} className={`text-[12px] px-3 py-2 rounded-md border bg-slate-950/90 backdrop-blur ${map[t.type]}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
