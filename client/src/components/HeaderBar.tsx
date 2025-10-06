import React from "react";
import { cn } from "@/lib/utils";

type Logo = { src?: string; alt: string; href?: string; };
type Env = "DEV" | "STAGE" | "PROD";

export function HeaderBar({
  teaim,
  customer,
  implementor,
  projectName,
  env = "DEV",
  onPickProject,
}: {
  teaim: Logo;
  customer: Logo;
  implementor?: Logo;
  projectName?: string;
  env?: Env;
  onPickProject?: () => void;
}) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-panel/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-4">
        {/* Left: TEAIM brand */}
        <a href={teaim.href || "#"} className="flex items-center gap-2 shrink-0">
          {teaim.src ? (
            <img src={teaim.src} alt={teaim.alt} className="h-6 w-auto" />
          ) : (
            <span className="text-lg font-semibold tracking-wide text-fg">
              TE<span className="text-brand-orange">AI</span>M
            </span>
          )}
        </a>

        {/* Center: Customer logo (dominant) */}
        <div className="mx-auto flex min-w-0 items-center justify-center">
          <div className="flex items-center gap-3">
            {customer?.src ? (
              <img src={customer.src} alt={customer.alt} className="h-7 w-auto max-w-[240px] object-contain" />
            ) : (
              <span className="truncate text-sm text-muted">{customer.alt}</span>
            )}
            {projectName && (
              <button
                onClick={onPickProject}
                className="truncate rounded-xl border border-border px-3 py-1 text-xs text-fg hover:bg-panelc transition-colors"
                title="Switch project"
                data-testid="button-switch-project"
              >
                {projectName}
              </button>
            )}
          </div>
        </div>

        {/* Right: Implementor + env + user */}
        <div className="flex items-center gap-3">
          {implementor?.src && (
            <img src={implementor.src} alt={implementor.alt} className="h-6 w-auto opacity-80" />
          )}
          <span
            className={cn(
              "rounded-lg px-2 py-0.5 text-[11px] font-medium border",
              env === "PROD" && "text-success border-success/30 bg-success/15",
              env === "STAGE" && "text-warning border-warning/30 bg-warning/15", 
              env === "DEV" && "text-teaim-primary border-teaim-primary/30 bg-teaim-primary/15"
            )}
            data-testid="env-indicator"
          >
            {env}
          </span>
          <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted" data-testid="user-avatar" />
        </div>
      </div>
    </header>
  );
}