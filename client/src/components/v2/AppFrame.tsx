import React from "react";

import ThemeToggle from "@/components/ThemeToggle";
import teaimLogo from "@/assets/teaim-logo.svg";

export type AppFrameProps = {
  title?: string;
  children?: React.ReactNode;
};

/** Minimal placeholder so builds pass; replace later with real shell */
function AppFrame({ title, children }: AppFrameProps) {
  return (
    <div className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-fg)]">
      <header className="px-4 py-3 border-b border-[var(--brand-card-border)] flex items-center justify-between gap-3 bg-[var(--brand-surface)]">
        <div className="flex items-center gap-3">
          <img src={teaimLogo} alt="TEAIM" className="h-6" />
          {title ? <h1 className="text-lg font-semibold">{title}</h1> : null}
        </div>
        <ThemeToggle />
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}

export default AppFrame;
export { AppFrame };
