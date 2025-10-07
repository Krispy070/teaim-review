import React from "react";
import { AppFrame } from "@/components/layout/AppFrame";
import SidebarV2 from "@/components/SidebarV2";
import ErrorBoundary from "@/components/ErrorBoundary";
import ToastHost from "@/components/ui/ToastHost";
import OfflineBanner from "@/components/OfflineBanner";

type Props = { children: React.ReactNode };

export default function AppShell({ children }: Props) {
  return (
    <div id="app-shell" className="min-h-screen bg-background text-foreground">
      <OfflineBanner />
      <AppFrame sidebar={<SidebarV2 />}>
        <ErrorBoundary>
          {children}
          <ToastHost />
        </ErrorBoundary>
      </AppFrame>
    </div>
  );
}
