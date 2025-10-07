import TopProgressBar from "@/components/TopProgressBar";
import { isBrandV2 } from "@/lib/brand";
import GlobalHeader from "@/components/GlobalHeader";
import NotificationToaster from "@/components/NotificationToaster";

export default function AppShell({ sidebar, children }:{ sidebar?:React.ReactNode; children:React.ReactNode }){
  const brand = isBrandV2();
  
  // For Brand V2, don't render AppShell at all - Brand V2 has its own AppFrame
  if (brand) {
    return <>{children}</>;
  }
  
  return (
    <div className="app-shell bg-background text-foreground">
      <TopProgressBar />
      <div className="app-shell-header">
        <GlobalHeader />
      </div>
      <div className="app-shell-main">
        <div className="app-shell-sidebar">{sidebar || null}</div>
        <div className="app-shell-content">{children}</div>
      </div>
      <NotificationToaster />
    </div>
  );
}