import { ReactNode } from "react";
import { Menu, Sun, Moon } from "lucide-react";
import { setTheme } from "../../lib/theme";
import { HeaderBar } from "../ui/HeaderBar";
import { isBrandV2 } from "@/lib/brand";

export function AppFrame({ 
  sidebar, 
  children, 
  headerConfig 
}: { 
  sidebar: ReactNode; 
  children: ReactNode;
  headerConfig?: {
    teaim: { src?: string; alt: string; href?: string };
    customer: { src?: string; alt: string; href?: string };
    implementor?: { src?: string; alt: string; href?: string };
    projectName?: string;
    tagline?: string;
    env?: "DEV" | "STAGE" | "PROD";
    onPickProject?: () => void;
    onBellClick?: () => void;
    onAvatarClick?: () => void;
  };
}) {
  // Default header config
  const defaultHeaderConfig = {
    teaim: { alt: "TEAIM", href: "/" },
    customer: { alt: "Customer", href: "#" },
    implementor: { alt: "Partner", href: "#" },
    projectName: "Project Dashboard",
    tagline: "Workday Implementation Hub",
    env: "DEV" as const,
    onPickProject: () => console.log("Pick project"),
    onBellClick: () => console.log("Bell clicked"),
    onAvatarClick: () => console.log("Avatar clicked"),
  };

  const config = { ...defaultHeaderConfig, ...headerConfig };

  return (
    <div className="h-screen bg-bg text-fg flex flex-col">
      {/* Header - Only render for non-Brand V2 routes */}
      {!isBrandV2() && <HeaderBar {...config} />}

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-panel overflow-y-auto">
          {sidebar}
        </aside>

        {/* Mobile top bar - Only render for non-Brand V2 routes */}
        {!isBrandV2() && (
          <div className="md:hidden fixed inset-x-0 top-16 z-40 border-b border-border bg-panel">
            <div className="h-14 px-4 flex items-center justify-between">
              <button className="p-2 rounded border border-border" data-testid="mobile-menu">
                <Menu className="h-5 w-5" />
              </button>
              <div className="font-semibold">TEAIM</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setTheme('light')} className="p-2 rounded border border-border" data-testid="theme-light">
                  <Sun className="h-4 w-4"/>
                </button>
                <button onClick={() => setTheme('dark')} className="p-2 rounded border border-border" data-testid="theme-dark">
                  <Moon className="h-4 w-4"/>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 min-w-0 pt-4 md:pt-0 overflow-y-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}