import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ScrollToTop(){
  const [pathname] = useLocation();
  useEffect(()=>{ try{ document.querySelector(".app-shell-content")?.scrollTo({top:0}); }catch{} },[pathname]);
  return null;
}