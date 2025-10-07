import React from "react";

export type AppFrameProps = {
  title?: string;
  children?: React.ReactNode;
};

/**
 * Minimal frame to satisfy v2 imports and keep builds green.
 * Replace/extend later with your real header/nav when ready.
 */
function AppFrame({ title, children }: AppFrameProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-4 py-3 border-b flex items-center gap-3">
        <img src="/teaim-logo.svg" alt="TEAIM" className="h-6" />
        {title ? <h1 className="text-lg font-semibold">{title}</h1> : null}
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}

export default AppFrame;
export { AppFrame };
