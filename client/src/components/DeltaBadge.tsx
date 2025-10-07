import { useEffect, useRef, useState } from "react";
export default function DeltaBadge({ value }:{ value:number }){
  const prev = useRef<number>(value);
  const [delta,setDelta]=useState<number>(0);
  useEffect(()=>{
    const d = value - prev.current;
    setDelta(d);
    prev.current = value;
    const t = setTimeout(()=>setDelta(0), 1200);
    return ()=>clearTimeout(t);
  },[value]);
  if (delta===0) return null;
  const pos = delta>0;
  return (
    <span className={`text-[11px] ml-1 ${pos?'text-[var(--brand-good)]':'text-red-400'}`}>
      {pos?`+${delta}`:delta}
    </span>
  );
}