import React from "react";

export default function FilterBar({
  children,
  right,
  onClear,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  onClear?: () => void;
}) {
  return (
    <div className="mb-2 rounded-xl border border-slate-800 bg-slate-950/60 backdrop-blur px-3 py-2 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <div className="ml-auto flex items-center gap-2">
        {onClear && (
          <button
            type="button"
            className="text-[11px] px-2 py-0.5 border border-slate-700 rounded hover:bg-slate-800 transition-colors"
            onClick={onClear}
            data-testid="button-filter-clear"
          >
            Clear
          </button>
        )}
        {right}
      </div>
    </div>
  );
}
