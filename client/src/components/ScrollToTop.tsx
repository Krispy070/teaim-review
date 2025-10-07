import { useEffect } from "react";
import { useLocation } from "wouter";
import { isBrandV2 } from "@/lib/brand";

export default function ScrollToTop(){
  const [pathname] = useLocation();
  useEffect(()=>{ 
    // Skip for Brand V2 - it has its own scroll restoration system
    if (isBrandV2()) return;
    try{ document.querySelector(".app-shell-content")?.scrollTo({top:0}); }catch{} 
  },[pathname]);
  return null;
}