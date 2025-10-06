import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export default function TopProgressBar(){
  const loc = useLocation();
  const ref = useRef<HTMLDivElement|null>(null);

  useEffect(()=>{
    const el = ref.current; if (!el) return;
    el.style.width = "0%"; el.style.opacity = "1";
    let w = 0; const t = setInterval(()=>{ w = Math.min(90, w + 10); el.style.width = w + "%"; }, 120);
    const done = ()=>{
      clearInterval(t); el.style.width = "100%";
      setTimeout(()=>{ el.style.opacity = "0"; el.style.width = "0%"; }, 180);
    };
    // cheap route settle
    const s = setTimeout(done, 900);
    return ()=>{ clearInterval(t); clearTimeout(s); };
  },[loc.key]);

  return (
    <div style={{position:'fixed', left:0, top:0, height:3, width:'0%', background:'var(--brand-accent)', zIndex:200, opacity:0, transition:'width .18s ease, opacity .2s ease'}} ref={ref}/>
  );
}