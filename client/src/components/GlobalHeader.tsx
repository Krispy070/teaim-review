import { useMemo } from "react";
import BrandedHeader from "@/components/BrandedHeader";
import { BrandTheme, useBrandingSettings } from "@/components/BrandTheme";
import ImgLogo from "@/components/ImgLogo";
import PresenceTracker from "@/components/PresenceTracker";
import ProjectSelector from "@/components/ProjectSelector";
import NotificationBell from "@/components/v2/NotificationBell";
import { HelpButton } from "@/components/HelpButton";
import { isBrandV2 } from "@/lib/brand";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/App";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";
import teaimLogo from "@/assets/teaim-logo.svg";

interface GlobalHeaderProps {
  className?: string;
}

export default function GlobalHeader({ className = "" }: GlobalHeaderProps) {
  const brandV2 = isBrandV2();
  const { projectId } = useOrg() || {};
  const presence = projectId ? (
    <PresenceTracker enabled={true} projectId={projectId} />
  ) : null;

  const env =
    import.meta.env.VITE_ENV ||
    (typeof window !== "undefined" && window.location.hostname.includes("repl")
      ? "DEV"
      : "PROD");

  const { data: settings, isLoading } = useBrandingSettings(projectId);
  const { user } = useAuth();

  const avatarInitials = useMemo(() => {
    const name =
      user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "";
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
    return initials.join("") || name.charAt(0).toUpperCase();
  }, [user]);

  const logoQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    params.set("t", Date.now().toString());
    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }, [projectId]);

  if (brandV2) {
    if (isLoading) {
      return (
        <>
          {presence}
          <header
            className={cn(
              "brand-surface header sticky top-0 z-50 w-full border-b border-border bg-[var(--brand-surface)]",
              className
            )}
          >
            <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-4 px-4">
              <div className="flex items-center gap-3 animate-pulse">
                <div className="h-6 w-20 rounded bg-muted" />
                <div className="h-6 w-24 rounded bg-muted" />
              </div>
              <div className="mx-auto flex-1 max-w-md animate-pulse">
                <div className="h-5 rounded bg-muted" />
              </div>
              <div className="flex items-center gap-3 animate-pulse">
                <div className="h-10 w-36 rounded bg-muted" />
                <div className="h-8 w-8 rounded-full bg-muted" />
              </div>
            </div>
          </header>
        </>
      );
    }

    const customerLogo = settings?.customer_logo_path
      ? `/api/branding/logo?which=customer${logoQuery}`
      : undefined;
    const vendorLogo = settings?.vendor_logo_path
      ? `/api/branding/logo?which=vendor${logoQuery}`
      : undefined;

    const headerTagline =
      settings?.header_text ||
      (settings?.customer_name && settings?.vendor_name
        ? `${settings.customer_name} & ${settings.vendor_name} Implementation Hub`
        : settings?.customer_name
        ? `${settings.customer_name} Implementation Hub`
        : "Workday Implementation Hub");

    return (
      <>
        {presence}
        <BrandTheme projectId={projectId} />
        <header
          className={cn(
            "brand-surface header sticky top-0 z-50 w-full border-b border-border bg-[var(--brand-surface)]",
            className
          )}
        >
          <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-4 px-4">
            <a
              href={projectId ? `/projects/${projectId}/dashboard` : "/"}
              className="flex items-center gap-2 shrink-0"
              aria-label="TEAIM home"
            >
              <img src={teaimLogo} alt="TEAIM" className="h-6 md:h-7" />
            </a>

            <div className="mx-auto flex min-w-0 flex-col items-center justify-center text-center">
              <div className="flex items-center gap-3">
                {customerLogo ? (
                  <ImgLogo
                    src={customerLogo}
                    alt={settings?.customer_name || "Customer"}
                    className="h-8 max-w-[240px] object-contain"
                  />
                ) : (
                  <span className="truncate text-sm text-[var(--text-soft)]">
                    {settings?.customer_name || "Customer"}
                  </span>
                )}
                {vendorLogo && (
                  <ImgLogo
                    src={vendorLogo}
                    alt={settings?.vendor_name || "Partner"}
                    className="h-6 max-w-[180px] object-contain"
                  />
                )}
              </div>
              <span className="mt-1 text-[11px] text-[var(--text-muted)] truncate">
                {headerTagline}
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <ProjectSelector />
              <ThemeToggle />
              <span className="k-pill k-pill--gold" data-testid="environment-pill">
                {env}
              </span>
              <HelpButton />
              <NotificationBell />
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--panel)] text-sm font-semibold text-[var(--text-strong)]"
                data-testid="user-avatar"
              >
                {avatarInitials}
              </div>
            </div>
          </div>
        </header>
      </>
    );
  }

  return (
    <>
      {presence}
      <header
        className={cn(
          "brand-surface sticky top-0 z-40 w-full border-b border-border bg-[var(--brand-surface)]",
          className
        )}
      >
        <div className="mx-auto max-w-7xl px-4 py-2">
          <BrandedHeader variant="full" showFallback={true} projectId={projectId} />
        </div>
      </header>
    </>
  );
}
