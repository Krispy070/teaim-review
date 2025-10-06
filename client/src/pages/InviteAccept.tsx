import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function InviteAccept(){
  const [location] = useLocation();
  // Extract token from URL path /invite/accept/:token
  const token = location.split('/').pop() || "";
  const [msg,setMsg]=useState("Accepting invite…");

  useEffect(()=>{ (async()=>{
    try{
      const r = await fetch(`/api/invite/accept/${token}`, { credentials:"include" });
      if (r.ok) setMsg("Invite accepted. You may now access the project.");
      else setMsg(`Invite failed: ${await r.text()}`);
    }catch(e:any){ setMsg(String(e?.message||e)); }
  })(); },[token]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Invite</h1>
      <div className="mt-2">{msg}</div>
    </div>
  );
}