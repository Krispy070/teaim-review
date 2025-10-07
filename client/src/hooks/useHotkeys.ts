import { useEffect } from "react";
import { useNavigate } from "wouter";

export default function useHotkeys(){
  const [, nav] = useNavigate();
  useEffect(()=>{
    function onKey(e: KeyboardEvent){
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") {
        if (e.key !== "/") return;
      }
      
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const el = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="search" i]');
        if (el) { e.preventDefault(); el.focus(); el.select?.(); }
      }
      
      if ((e.key === "d" || e.key === "D") && (e as any).prevKey === "g") {
        nav("/dashboard");
      }
      (e as any).prevKey = e.key;
    }
    window.addEventListener("keydown", onKey as any);
    return ()=> window.removeEventListener("keydown", onKey as any);
  }, [nav]);
}
