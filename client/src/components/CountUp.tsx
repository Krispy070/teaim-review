import { useEffect, useRef, useState } from "react";

export default function CountUp({
  to=0, duration=600, flashOnChange=true
}:{ to:number; duration?:number; flashOnChange?:boolean }){
  const [value,setValue]=useState(0);
  const [flash,setFlash]=useState<"up"|"down"|null>(null);
  const last = useRef(0);

  useEffect(()=>{
    const start = performance.now(); const from = last.current; const delta = to - from;
    if (flashOnChange && delta!==0) setFlash(delta>0 ? "up" : "down");
    let raf:number;
    const tick = (t:number)=>{
      const p = Math.min(1, (t-start)/duration);
      setValue(Math.round(from + delta * p));
      if (p<1) raf = requestAnimationFrame(tick);
      else { last.current = to; setTimeout(()=>setFlash(null), 500); }
    };
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    return ()=> cancelAnimationFrame(raf);
  },[to,duration,flashOnChange]);

  return <span className={flash==="up" ? "applied-glow" : flash==="down" ? "applied-glow-down" : ""}>{value}</span>;
}