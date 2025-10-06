import React from "react";
import { isBrandV2 } from "@/lib/brand";
import ProjectSelector from "@/components/ProjectSelector";
import NotificationBell from "@/components/v2/NotificationBell";
import { HelpButton } from "@/components/HelpButton";

type Logo = { src?: string; alt: string; href?: string };
type Env = "DEV" | "STAGE" | "PROD";

export function HeaderBar({
  teaim,
  customer,
  implementor,
  projectName,
  env = "DEV",
  onProjectClick,
  onBellClick,
  onAvatarClick,
}: {
  teaim: Logo;
  customer: Logo;
  implementor?: Logo;
  projectName?: string;
  env?: Env;
  onProjectClick?: () => void;
  onBellClick?: () => void;
  onAvatarClick?: () => void;
}) {
  return (
    <header className="header sticky top-0 z-50 w-full">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-4 px-4">
        {/* Left: TEAIM */}
        <a href={teaim.href || "/"} className="flex items-center gap-2 shrink-0">
          {teaim.src ? <img src={teaim.src} alt={teaim.alt} className="h-7 w-auto" /> : <span className="text-lg font-semibold text-[var(--text-strong)]">TEAIM</span>}
        </a>

        {/* Center: Customer identity */}
        <div className="min-w-0 text-center flex flex-col items-center mx-auto">
          {customer?.src ? (
            <img src={customer.src} alt={customer.alt} className="h-8 max-w-[260px] object-contain" />
          ) : (
            <span className="truncate text-sm text-[var(--text-soft)]">{customer.alt}</span>
          )}
          <div className="mt-1 flex items-center gap-6">
            <span className="text-[11px] text-[var(--text-muted)] truncate">Workday Implementation Hub</span>
          </div>
        </div>

        {/* Project Selector */}
        <div className="flex-shrink-0">
          <ProjectSelector />
        </div>

        {/* Right: Implementor + ENV + help + bell + avatar */}
        <div className="flex items-center gap-3">
          {implementor?.src && <img src={implementor.src} alt={implementor.alt} className="h-6 w-auto opacity-90" />}
          <span className="k-pill k-pill--gold">{env}</span>
          <HelpButton />
          <NotificationBell />
          <button onClick={onAvatarClick} className="h-8 w-8 rounded-full" style={{ background: "#2E3340" }} title="Account" />
        </div>
      </div>
    </header>
  );
}