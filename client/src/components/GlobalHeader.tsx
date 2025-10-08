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

  const headerClasses = cn(
    "brand-surface sticky top-0 z-40 border-b border-black/5 dark:border-white/10",
    className
  );

  if (brandV2) {
    if (isLoading) {
      return (
        <>
          {presence}
          <header className={headerClasses}>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/teaim-logo.svg" alt="TEAIM" className="h-6 md:h-7" />
                <span className="hidden md:inline text-sm tracking-wide text-brand-charcoal dark:text-white/90">
                  TEAIM.app
                </span>
              </div>
              <div className="flex flex-1 justify-center px-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="h-6 w-24 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-32 rounded bg-muted animate-pulse" />
                <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
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
        <header className={headerClasses}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/teaim-logo.svg" alt="TEAIM" className="h-6 md:h-7" />
              <span className="hidden md:inline text-sm tracking-wide text-brand-charcoal dark:text-white/90">
                TEAIM.app
              </span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
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
            <div className="flex items-center gap-2">
              <ProjectSelector />
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
      <header className={headerClasses}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/teaim-logo.svg" alt="TEAIM" className="h-6 md:h-7" />
            <span className="hidden md:inline text-sm tracking-wide text-brand-charcoal dark:text-white/90">
              TEAIM.app
            </span>
          </div>
          <div className="flex flex-1 justify-center px-4">
            <BrandedHeader variant="full" showFallback={true} projectId={projectId} />
          </div>
          <div className="flex items-center gap-2" />
        </div>
      </header>
    </>
  );
}
