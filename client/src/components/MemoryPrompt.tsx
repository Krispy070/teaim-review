import type { MemoryRecommendation } from "@shared/memory";
import { useMemo } from "react";

type MemoryPromptProps = Pick<MemoryRecommendation, "title" | "text" | "confidence"> & {
  onApply?: () => void;
  onDismiss?: () => void;
};

export default function MemoryPrompt({ title, text, confidence, onApply, onDismiss }: MemoryPromptProps) {
  const confidenceLabel = useMemo(() => {
    if (typeof confidence !== "number" || Number.isNaN(confidence)) return null;
    const raw = confidence > 1 ? confidence : confidence * 100;
    const clamped = Math.max(0, Math.min(100, Math.round(raw)));
    return `${clamped}% confidence`;
  }, [confidence]);

  return (
    <div className="memoryPrompt relative w-full rounded-2xl border border-border bg-background/70 p-4 shadow-sm backdrop-blur">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss memory suggestion"
          className="absolute right-3 top-3 rounded-full border border-transparent p-1 text-xs opacity-60 transition hover:opacity-100"
        >
          ×
        </button>
      )}
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5">
          AI memory
        </span>
        {confidenceLabel && <span className="text-[10px] font-medium opacity-75">{confidenceLabel}</span>}
      </div>
      <h3 className="mt-3 text-sm font-semibold leading-tight text-foreground">{title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/80">{text}</p>
      {(onApply || onDismiss) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {onApply && (
            <button
              type="button"
              onClick={onApply}
              className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
            >
              Apply suggestion
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/70 transition hover:bg-background/60"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
