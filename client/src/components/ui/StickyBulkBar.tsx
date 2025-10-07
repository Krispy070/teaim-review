import React from "react";

export default function StickyBulkBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed left-[260px] right-3 bottom-3 z-[900]">
      <div className="rounded-xl border border-slate-800 bg-slate-950/85 backdrop-blur px-3 py-2 shadow-lg">
        <div className="flex items-center gap-2 flex-wrap">{children}</div>
      </div>
    </div>
  );
}
