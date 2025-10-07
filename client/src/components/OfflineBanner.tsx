import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

export default function OfflineBanner(){
  const [ok,setOk]=useState(true);
  useEffect(()=>{
    const set = ()=> setOk(navigator.onLine);
    window.addEventListener("online", set); window.addEventListener("offline", set);
    set(); return ()=>{ window.removeEventListener("online", set); window.removeEventListener("offline", set); };
  },[]);
  if (ok) return null;
  return (
    <div className="fixed left-0 right-0 top-0 z-[2000] bg-red-900/70 border-b border-red-700 text-red-200 text-xs px-3 py-1 flex items-center gap-2 justify-between">
      <span>You're offline — changes won't sync.</span>
      <Button variant="ghost" onClick={()=>location.reload()}>Retry</Button>
    </div>
  );
}
