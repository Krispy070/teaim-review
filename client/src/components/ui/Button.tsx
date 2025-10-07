import React from "react";

type Variant = "default" | "primary" | "danger" | "ghost";
export function Button(
  { className="", variant="default", ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
){
  const base = "text-xs px-2 py-1 rounded-md border transition-colors disabled:opacity-60";
  const map: Record<Variant, string> = {
    default: "border-slate-700 bg-slate-900/50 hover:bg-slate-800/60",
    primary: "border-sky-600 bg-sky-900/40 text-sky-200 hover:bg-sky-900/60",
    danger:  "border-red-600 bg-red-900/30 text-red-300 hover:bg-red-900/50",
    ghost:   "border-transparent hover:bg-slate-900/40"
  };
  return <button className={`${base} ${map[variant]} ${className}`} {...props} />;
}