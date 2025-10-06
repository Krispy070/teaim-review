import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";
import { LogOut, LogIn, Bell } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandTheme, useBrandingSettings } from "./BrandTheme";
import { isBrandV2, setBrandV2 } from "@/lib/brand";
import ImgLogo from "@/components/ImgLogo";
import ProjectSwitcher from "@/components/ProjectSwitcher";
import HeaderCrumbs from "@/components/HeaderCrumbs";
import CommandPalette from "@/components/CommandPalette";
import NotificationsDrawer from "@/components/NotificationsDrawer";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNavUpdates } from "@/hooks/useNavUpdates";
import { useRouteUpdates } from "@/hooks/useRouteUpdates";
import { useOrg } from "@/App";
import { useState } from "react";
import teaimLogoUrl from "@assets/Screenshot 2025-09-22 144200_1758642800274.jpg";
import PresenceTracker from "@/components/PresenceTracker";
import PresenceIndicator from "@/components/PresenceIndicator";

interface BrandedHeaderProps {
  variant?: "full" | "compact" | "logos-only";
  showFallback?: boolean;
  className?: string;
  projectId?: string | null;  // NEW: Support project-aware branding
}

export default function BrandedHeader({ 
  variant = "full", 
  showFallback = true,
  className = "",
  projectId: propProjectId = null  // NEW: Accept project ID for project-level branding
}: BrandedHeaderProps) {
  // For Brand V2 routes, don't render legacy header
  if (isBrandV2()) {
    return null;
  }

  // Get projectId from context, fallback to prop
  const { projectId: contextProjectId } = useOrg() || {};
  const projectId = propProjectId || contextProjectId;
  
  // Authentication state from context
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  
  // Notifications drawer state
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  
  // Nav updates hook for notification bell (legacy)
  const { unseenCount: legacyUnseenCount, markAllAsSeen: legacyMarkAllAsSeen, hasUpdates: legacyHasUpdates } = useNavUpdates();
  
  // Route-specific updates hook
  const { unseenKeys, markAllSeen } = useRouteUpdates(projectId || "");
  const count = unseenKeys().length;
  const hasRouteUpdates = count > 0;

  // Query branding settings with project awareness
  const { data: settings, isLoading, error } = useBrandingSettings(projectId);

  // Render presence tracker for all variants
  const presenceTracker = projectId ? <PresenceTracker enabled={true} projectId={projectId} /> : null;

  // Sign out function
  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Sign in function
  const handleSignIn = () => {
    navigate('/login');
  };

  // Handle updates bell click
  const handleUpdatesClick = () => {
    markAllSeen();
    legacyMarkAllAsSeen();
    navigate('/audit'); // Navigate to audit page
  };

  // Build logo URLs with project awareness
  const logoParams = projectId ? `&project_id=${projectId}` : '';
  const cacheBuster = `&t=${Date.now()}`;

  // Fallback to default TEAIM branding if no custom branding or error
  const showDefaultBranding = (error || !settings) && showFallback;
  
  // Get branding data for new header format
  const b = settings || {};
  
  // Environment detection
  const env = import.meta.env.VITE_ENV || (location.hostname.includes("repl") ? "DEV" : "PROD");
  const projectCode = (b?.customer_name || b?.vendor_name) ? (b.customer_name || b.vendor_name) : "";
  
  if (isLoading) {
    if (variant === "logos-only") {
      return (
        <>
          {presenceTracker}
          <div className={`flex items-center gap-3 ${className}`}>
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </>
      );
    }
    
    return (
      <>
        {presenceTracker}
        <div className={`flex items-center gap-2 ${className}`}>
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-24" />
            {variant === "full" && <Skeleton className="h-3 w-32" />}
          </div>
        </div>
      </>
    );
  }

  if (showDefaultBranding) {
    // Fallback to default TEAIM branding
    if (variant === "logos-only") {
      return (
        <div className={`flex items-center gap-2 ${className}`}>
          <img 
            src={teaimLogoUrl} 
            alt="TEAIM logo" 
            className="h-8 w-8 object-contain rounded-lg" 
          />
        </div>
      );
    }

    return (
      <>
        {presenceTracker}
        <div className="w-full border-b">
          <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-2">
              <img 
                src={teaimLogoUrl} 
                alt="TEAIM logo" 
                className="h-8 w-8 object-contain rounded-lg" 
              />
              <div>
                <h1 className="text-xl font-semibold" data-testid="app-title">TEAIM</h1>
                {variant === "full" && (
                  <p className="text-xs text-muted-foreground">Workday Implementation Hub</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <PresenceIndicator className="border-r border-border pr-3" projectId={projectId || undefined} />
              <span className="brand-chip text-[11px]" data-testid="environment-pill">{env}</span>
              {projectCode && (
                <span className="brand-chip text-[11px]" data-testid="project-code-badge">{projectCode}</span>
              )}
              
              {/* Updates Bell */}
              <div className="relative">
                <button className="brand-btn text-xs relative" onClick={handleUpdatesClick} title="Mark all seen"
                        data-testid="updates-bell">
                  Updates {count > 0 ? `(${count})` : ""}
                  {count > 0 && <span className="absolute -top-1 -right-1 w-[8px] h-[8px] rounded-full bg-red-500"
                                      data-testid="updates-count-dot"></span>}
                </button>
              </div>
              
              {/* Notifications Bell */}
              <button 
                className="brand-btn text-xs relative" 
                onClick={() => setNotificationsOpen(true)} 
                title="View notifications"
                data-testid="notifications-bell"
              >
                <Bell className="w-3 h-3 mr-1" />
                Notifications
              </button>
              
              {/* Authentication */}
              {user ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSignOut}
                  data-testid="button-sign-out"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  Sign out
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSignIn}
                  data-testid="button-sign-in"
                >
                  <LogIn className="w-4 h-4 mr-1" />
                  Sign in
                </Button>
              )}
              {/* DEMO TOGGLE */}
              <button
                className="brand-btn text-xs"
                onClick={()=> setBrandV2(!isBrandV2())}
                title="Toggle Brand v2"
              >
                {isBrandV2() ? "Brand v2: On" : "Brand v2: Off"}
              </button>
            </div>
            <CommandPalette />
          </div>
        </div>
      </>
    );
  }

  // Custom branding with logos
  const hasCustomerLogo = settings?.customer_logo_path || settings?.customer_logo_bucket;
  const hasVendorLogo = settings?.vendor_logo_path || settings?.vendor_logo_bucket;
  const headerText = settings?.header_text || 
    (settings?.customer_name && settings?.vendor_name 
      ? `${settings.customer_name} & ${settings.vendor_name} Implementation Hub`
      : settings?.customer_name 
        ? `${settings.customer_name} Implementation Hub`
        : "Workday Implementation Hub");

  if (variant === "logos-only") {
    return (
      <>
        {presenceTracker}
        <div className={`flex items-center gap-3 ${className}`}>
          {/* Apply dynamic theme */}
          <BrandTheme projectId={projectId} />
          
          {hasCustomerLogo && (
            <ImgLogo 
              src={`/api/branding/logo?which=customer${logoParams}`}
              alt={`${settings?.customer_name || 'Customer'} logo`} 
              className="h-8 w-auto max-w-24 object-contain"
            />
          )}
          {hasVendorLogo && (
            <ImgLogo 
              src={`/api/branding/logo?which=vendor${logoParams}`}
              alt={`${settings?.vendor_name || 'Vendor'} logo`} 
              className="h-8 w-auto max-w-24 object-contain"
            />
          )}
          {!hasCustomerLogo && !hasVendorLogo && showFallback && (
            <img 
              src={teaimLogoUrl} 
              alt="TEAIM logo" 
              className="h-8 w-8 object-contain rounded-lg" 
            />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {presenceTracker}
      <div className="w-full border-b" style={{borderColor: b.theme_color || "#111111"}}>
        <BrandTheme projectId={projectId}/>
        <div className="flex items-center justify-between p-2">
          <div className="flex items-center gap-2">
            {b.customer_logo_path &&
              <ImgLogo src={`/api/branding/logo?which=customer${projectId?`&project_id=${projectId}`:""}`} alt="customer" className="h-6" />}
            {b.customer_name && <div className="text-sm font-medium">{b.customer_name}</div>}
          </div>

          {/* center text */}
          <div className="hidden md:block">
            <HeaderCrumbs projectLabel={b.customer_name || b.vendor_name || ""} />
          </div>

          <div className="flex items-center gap-2">
            <PresenceIndicator className="border-r border-border pr-3" projectId={projectId || undefined} />
            <span className="brand-chip text-[11px]" data-testid="environment-pill">{env}</span>
            {projectCode && (
              <span className="brand-chip text-[11px]" data-testid="project-code-badge">{projectCode}</span>
            )}
            
            {/* Updates Bell */}
            <div className="relative">
              <button className="brand-btn text-xs relative" onClick={handleUpdatesClick} title="Mark all seen"
                      data-testid="updates-bell">
                Updates {count > 0 ? `(${count})` : ""}
                {count > 0 && <span className="absolute -top-1 -right-1 w-[8px] h-[8px] rounded-full bg-red-500"
                                    data-testid="updates-count-dot"></span>}
              </button>
            </div>
            
            {/* Notifications Bell */}
            <button 
              className="brand-btn text-xs relative" 
              onClick={() => setNotificationsOpen(true)} 
              title="View notifications"
              data-testid="notifications-bell"
            >
              <Bell className="w-3 h-3 mr-1" />
              Notifications
            </button>
            
            {/* Authentication */}
            {user ? (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSignOut}
                data-testid="button-sign-out"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Sign out
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSignIn}
                data-testid="button-sign-in"
              >
                <LogIn className="w-4 h-4 mr-1" />
                Sign in
              </Button>
            )}
            <ProjectSwitcher />
            <button
              className="brand-btn text-xs"
              onClick={()=> setBrandV2(!isBrandV2())}
              title="Toggle Brand v2"
            >
              {isBrandV2() ? "Brand v2: On" : "Brand v2: Off"}
            </button>
            <CommandPalette />

            <div className="flex items-center gap-3">
              {/* Customer (left) */}
              {b.customer_logo_path
                ? <img src={`/api/branding/logo?which=customer${projectId?`&project_id=${projectId}`:""}`} alt="customer" className="h-6" />
                : (b.customer_name ? <div className="text-sm font-medium">{b.customer_name}</div> : null)}
              <span className="text-xs text-muted-foreground">•</span>
              {/* Implementor/Vendor (right) */}
              {b.vendor_logo_path
                ? <img src={`/api/branding/logo?which=vendor${projectId?`&project_id=${projectId}`:""}`} alt="vendor" className="h-6" />
                : (b.vendor_name ? <div className="text-sm font-medium">{b.vendor_name}</div> : null)}
              <div className="text-sm font-semibold" style={{color:b.theme_color || "#111111"}}>TEAIM</div>
            </div>
          </div>
        </div>
      </div>
      
      <NotificationsDrawer 
        open={notificationsOpen} 
        onClose={() => setNotificationsOpen(false)} 
      />
    </>
  );
}