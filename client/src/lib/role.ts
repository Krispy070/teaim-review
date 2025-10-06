import { useEffect, useState } from "react";
import { supa } from "@/lib/supabase";

const DEV = import.meta.env.VITE_DEV_AUTH === "1";
const devOv = () => { try { return JSON.parse(localStorage.getItem("kap.devAuth") || "null"); } catch { return null; } };

export function useUserRole() {
  const [role,setRole] = useState<"viewer"|"member"|"admin">("viewer");
  useEffect(()=>{
    const ov = devOv();
    if (DEV || ov?.dev) {
      let devRole: string;
      if (ov?.role) {
        devRole = ov.role;
      } else if (import.meta.env.VITE_DEV_ROLE) {
        devRole = import.meta.env.VITE_DEV_ROLE;
      } else {
        devRole = "admin";
      }
      const r = devRole.toLowerCase();
      setRole((["viewer","member","admin"].includes(r) ? r : "admin") as any);
      return;
    }
    supa.auth.getUser().then(u=>{
      const r = ((u.data.user?.app_metadata as any)?.user_role || "member").toLowerCase();
      setRole((["viewer","member","admin"].includes(r) ? r : "member") as any);
    });
  },[]);
  return role;
}

export function canEdit(role:"viewer"|"member"|"admin"){ return role!=="viewer"; }
export function isAdmin(role:"viewer"|"member"|"admin"){ return role==="admin"; }
