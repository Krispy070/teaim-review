import { ReactNode, useState, useEffect, useRef } from "react";
import { Menu, Sun, Moon, Eye, EyeOff, Command } from "lucide-react";
import { setTheme } from "../../lib/theme";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useLocation } from "wouter";
import DebugPanel from "@/components/DebugPanel";
import IngestBanner from "@/components/IngestBanner";
import ToastViewport from "@/components/ToastViewport";
import CommandPalette from "@/components/CommandPalette";
import GlobalHeader from "@/components/GlobalHeader";
import NotificationToaster from "@/components/NotificationToaster";

// Module-level storage for scroll positions (persists across component remounts)
const scrollPositions: Record<string, number> = {};

export function AppFrame({
  sidebar,
  children
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location, navigate] = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  
  // Focus mode: nav toggle state with localStorage persistence
  const [hideNav, setHideNav] = useState(() => {
    const saved = localStorage.getItem("teaim_hide_nav");
    return saved === "1";
  });
  const [peekOpen, setPeekOpen] = useState(false); // edge-reveal transient state
  const edgeTimer = useRef<number | null>(null);
  
  // Determine if sidebar should be shown (desktop only, not on mobile)
  const showDesktopSidebar = !hideNav && sidebar;

  // Hook fetch and console (Fix Pack v117)
  useEffect(() => {
    (window as any).__dbg = (window as any).__dbg || {};
    (window as any).__dbg.logs = (window as any).__dbg.logs || [];
    ["error", "warn"].forEach((level) => {
      const orig = (console as any)[level];
      (console as any)[level] = function (...args: any[]) {
        (window as any).__dbg.logs.push({ level, args, at: new Date().toISOString() });
        orig.apply(console, args);
      };
    });

    const origFetch = window.fetch;
    window.fetch = async (...args: any[]) => {
      const at = new Date().toISOString();
      try {
        const res: Response = await origFetch.apply(window, args as any);
        const traceId = res.headers.get("x-trace-id") || "";
        (window as any).__dbg.api = (window as any).__dbg.api || [];
        (window as any).__dbg.api.push({
          method: args[1]?.method || "GET",
          url: String(args[0]),
          status: res.status,
          traceId,
          at,
        });
        (window as any).__dbg.lastTraceId = traceId;
        return res;
      } catch (e) {
        (window as any).__dbg.api = (window as any).__dbg.api || [];
        (window as any).__dbg.api.push({
          method: args[1]?.method || "GET",
          url: String(args[0]),
          status: -1,
          at,
        });
        throw e;
      }
    };
  }, []);

  // Close mobile menu and peek overlay when navigating to a new page
  useEffect(() => {
    setMobileMenuOpen(false);
    setPeekOpen(false);
  }, [location]);
  
  // Keyboard shortcuts: n for toggle nav, g+d for dashboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      const isEditableField = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      
      // Toggle nav with "n" key
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditableField) return;
        setHideNav(v => {
          const newValue = !v;
          localStorage.setItem("teaim_hide_nav", newValue ? "1" : "0");
          return newValue;
        });
      }
      
      // g then d → Dashboard
      if (e.key.toLowerCase() === "d" && (window as any).__gPressed) {
        if (isEditableField) {
          (window as any).__gPressed = false;
          return;
        }
        const projectMatch = location.match(/\/projects\/([^/]+)/);
        const projectId = projectMatch ? projectMatch[1] : null;
        if (projectId) {
          navigate(`/projects/${projectId}/dashboard`);
        } else {
          navigate("/");
        }
        (window as any).__gPressed = false;
      }
      if (e.key.toLowerCase() === "g") {
        if (isEditableField) {
          (window as any).__gPressed = false;
          return;
        }
        (window as any).__gPressed = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "g") {
        (window as any).__gPressed = false;
      }
    };
    const onBlur = () => {
      // Reset g pressed flag on blur to prevent stale state
      (window as any).__gPressed = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", onBlur);
    };
  }, [location, navigate]);
  
  // Edge hover handlers for peek sidebar
  useEffect(() => {
    if (showDesktopSidebar || !sidebar) return; // no peek if sidebar visible or no sidebar
    const zone = document.getElementById("left-edge-zone");
    if (!zone) return;
    const enter = () => {
      // small delay to avoid accidental flicker
      edgeTimer.current = window.setTimeout(() => setPeekOpen(true), 120);
    };
    const leave = () => {
      if (edgeTimer.current) window.clearTimeout(edgeTimer.current);
      setPeekOpen(false);
    };
    zone.addEventListener("mouseenter", enter);
    zone.addEventListener("mouseleave", leave);
    return () => {
      zone.removeEventListener("mouseenter", enter);
      zone.removeEventListener("mouseleave", leave);
    };
  }, [showDesktopSidebar, sidebar]);

  // Scroll restoration: save scroll position continuously and restore on navigation
  useEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement) return;

    // Save scroll position continuously while scrolling
    const handleScroll = () => {
      if (mainElement.scrollTop > 0) {
        scrollPositions[location] = mainElement.scrollTop;
      }
    };

    // Add scroll listener to save position in real-time
    mainElement.addEventListener('scroll', handleScroll, { passive: true });

    // Restore scroll position for this location after content renders
    const savedPosition = scrollPositions[location];
    if (savedPosition !== undefined) {
      // Use double requestAnimationFrame to ensure content has loaded
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (mainElement) {
            mainElement.scrollTop = savedPosition;
          }
        });
      });
    }

    // Cleanup: remove scroll listener
    return () => {
      mainElement.removeEventListener('scroll', handleScroll);
    };
  }, [location]);
  return (
    <div className="h-screen bg-bg text-fg flex flex-col">
      {/* Header - Always render with logos */}
      <GlobalHeader />
      <IngestBanner />

      <div className="flex flex-1 min-h-0">
        {/* Edge hover zone (20px) - only when nav is hidden on desktop */}
        {!showDesktopSidebar && sidebar && (
          <div 
            id="left-edge-zone" 
            className="hidden md:block fixed left-0 top-0 h-screen w-5 z-30" 
            aria-hidden 
          />
        )}
        
        {/* Pinned Sidebar - Desktop only */}
        {showDesktopSidebar && (
          <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-panel overflow-y-auto">
            {sidebar}
          </aside>
        )}
        
        {/* Peek overlay sidebar (when nav is hidden and user hovers edge) - Desktop only */}
        {!showDesktopSidebar && peekOpen && sidebar && (
          <>
            <div 
              className="hidden md:block fixed inset-0 bg-black/20 z-40" 
              onClick={() => setPeekOpen(false)} 
              aria-hidden 
            />
            <aside
              className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 z-50 flex-col border-r border-border bg-panel shadow-lg animate-[slideIn_.12s_ease] overflow-y-auto"
              onMouseLeave={() => setPeekOpen(false)}
            >
              <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
                <div className="font-semibold text-sm">Navigation</div>
                <button
                  onClick={() => {
                    // pin the nav
                    localStorage.setItem("teaim_hide_nav", "0");
                    setHideNav(false);
                    setPeekOpen(false);
                  }}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-accent"
                  title="Pin sidebar"
                  data-testid="button-pin-sidebar"
                >
                  Pin
                </button>
              </div>
              {sidebar}
            </aside>
            <style>{`@keyframes slideIn { from { transform: translateX(-8px); opacity:.9 } to { transform: translateX(0); opacity:1 } }`}</style>
          </>
        )}

        {/* Mobile Navigation Drawer */}
        {sidebar && (
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetContent 
              side="left" 
              className="w-64 p-0 bg-panel border-r border-border"
              aria-label="Main navigation"
              aria-describedby="mobile-nav-description"
            >
              <div id="mobile-nav-description" className="sr-only">
                Navigate through project sections and features
              </div>
              {sidebar}
            </SheetContent>
          </Sheet>
        )}

        {/* Mobile top bar - hide when drawer is open to prevent focus issues */}
        <div className={`md:hidden fixed inset-x-0 top-16 z-40 border-b border-border bg-panel ${mobileMenuOpen ? 'hidden' : ''}`}>
          <div className="h-14 px-4 flex items-center justify-between">
            <button 
              className="p-2 rounded border border-border" 
              onClick={() => setMobileMenuOpen(true)}
              data-testid="mobile-menu"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="font-semibold">TEAIM</div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setTheme('light')} 
                className="p-2 rounded border border-border" 
                data-testid="theme-light"
                aria-label="Switch to light theme"
              >
                <Sun className="h-4 w-4"/>
              </button>
              <button 
                onClick={() => setTheme('dark')} 
                className="p-2 rounded border border-border" 
                data-testid="theme-dark"
                aria-label="Switch to dark theme"
              >
                <Moon className="h-4 w-4"/>
              </button>
            </div>
          </div>
        </div>
        
        {/* Desktop: Toggle nav button (floating) */}
        <button
          onClick={() => {
            setHideNav(v => {
              const newValue = !v;
              localStorage.setItem("teaim_hide_nav", newValue ? "1" : "0");
              return newValue;
            });
          }}
          className="hidden md:flex fixed top-20 right-4 z-30 items-center gap-2 px-3 py-1.5 text-xs rounded-full border border-border bg-panel shadow-sm hover:bg-accent transition-colors"
          title={`${hideNav ? 'Show' : 'Hide'} navigation (press n)`}
          data-testid="button-toggle-nav"
        >
          {hideNav ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          <span>{hideNav ? 'Show' : 'Hide'} nav</span>
        </button>
        
        {/* Desktop: Floating "Show nav" pill when nav is hidden (bottom-left) */}
        {hideNav && sidebar && (
          <button
            onClick={() => {
              setHideNav(false);
              localStorage.setItem("teaim_hide_nav", "0");
            }}
            className="hidden md:flex fixed left-3 bottom-3 z-30 items-center gap-2 px-3 py-1.5 text-xs rounded-full border border-border bg-panel shadow-lg hover:bg-accent transition-colors"
            title="Show navigation"
            data-testid="button-show-nav-pill"
          >
            <Eye className="h-3 w-3" />
            <span>Show nav</span>
          </button>
        )}

        {/* Main */}
        <main ref={mainRef} className="flex-1 min-w-0 pt-4 md:pt-0 overflow-y-auto app-shell-content">
          <div className="p-6">{children}</div>
        </main>
      </div>
      <DebugPanel />
      <ToastViewport />
      <NotificationToaster />
      <CommandPalette />
    </div>
  );
}