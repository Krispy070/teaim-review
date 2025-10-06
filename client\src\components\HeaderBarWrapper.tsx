import { useState } from "react";
import { HeaderBar } from "./HeaderBar";
import { useBrandingSettings } from "./BrandTheme";
import { useAuth } from "@/contexts/AuthContext";
// @ts-ignore - App.jsx file import
import { useOrg } from "@/App";
import { useLocation } from "wouter";
import teaimLogoUrl from "@assets/Screenshot 2025-09-22 144200_1758642800274.jpg";
import PresenceTracker from "@/components/PresenceTracker";
import { isBrandV2 } from "@/lib/brand";

interface HeaderBarWrapperProps {
  className?: string;
}

export default function HeaderBarWrapper({ className = "" }: HeaderBarWrapperProps) {
  // Guard: Don't render for Brand V2 routes
  if (isBrandV2()) {
    return null;
  }

  const { projectId } = useOrg() || {};
  const { user, signOut } = useAuth();
  const [location, navigate] = useLocation();
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  
  // Query branding settings
  const { data: settings, isLoading, error } = useBrandingSettings(projectId);
  
  // Environment detection
  const env = import.meta.env.VITE_ENV || (window.location.hostname.includes("repl") ? "DEV" : "PROD") as "DEV" | "STAGE" | "PROD";
  
  // Build logo URLs with project awareness and cache busting
  const logoSearchParams = new URLSearchParams();
  if (projectId) logoSearchParams.set('project_id', projectId);
  logoSearchParams.set('t', Date.now().toString());
  const logoQueryString = logoSearchParams.toString();
  
  // Handle project picker
  const handlePickProject = () => {
    setProjectPickerOpen(true);
    // You could navigate to a project selector page or open a modal
    navigate('/projects');
  };
  
  if (isLoading) {
    return (
      <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-[#0B0B0E]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-4">
          <div className="animate-pulse flex space-x-4 w-full">
            <div className="h-6 bg-zinc-700 rounded w-20"></div>
            <div className="flex-1 flex justify-center">
              <div className="h-7 bg-zinc-700 rounded w-32"></div>
            </div>
            <div className="flex space-x-2">
              <div className="h-6 bg-zinc-700 rounded w-16"></div>
              <div className="h-7 w-7 bg-zinc-700 rounded-full"></div>
            </div>
          </div>
        </div>
      </header>
    );
  }
  
  // Prepare logo data from branding settings
  const b = settings || {};
  
  // Build logo URLs (using available properties)
  const teaimLogoSrc = teaimLogoUrl; // Always use TEAIM logo for left position
  const customerLogoSrc = b?.customer_logo_path ? `/api/branding/logo/customer?${logoQueryString}` : undefined;
  const implementorLogoSrc = b?.vendor_logo_path ? `/api/branding/logo/vendor?${logoQueryString}` : undefined;
  
  // Prepare data for HeaderBar
  const teaimLogo = {
    src: teaimLogoSrc,
    alt: "TEAIM",
    href: "/"
  };
  
  const customerLogo = {
    src: customerLogoSrc,
    alt: b?.customer_name || "Customer"
  };
  
  const implementorLogo = implementorLogoSrc ? {
    src: implementorLogoSrc,
    alt: b?.vendor_name || "Implementor"
  } : undefined;
  
  const projectName = b?.header_text || projectId;
  
  return (
    <>
      {projectId && <PresenceTracker enabled={true} projectId={projectId} />}
      <HeaderBar
        teaim={teaimLogo}
        customer={customerLogo}
        implementor={implementorLogo}
        projectName={projectName}
        env={env}
        onPickProject={handlePickProject}
      />
    </>
  );
}