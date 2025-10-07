import React from "react";

export default function Badge({ tone="default", children }:{
  tone?: "default"|"ok"|"warn"|"err"|"info";
  children: React.ReactNode;
}){
  const map:any = {
    default: "border-slate-700 text-slate-200",
    ok: "border-emerald-600 text-emerald-300",
    warn: "border-amber-600 text-amber-300",
    err: "border-red-600 text-red-300",
    info: "border-sky-600 text-sky-300",
  };
  return (
    <span className={`text-[11px] px-1.5 py-0.5 border rounded-full ${map[tone]}`}>
      {children}
    </span>
  );
}
