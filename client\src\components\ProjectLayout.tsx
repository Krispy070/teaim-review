import { Outlet } from "react-router-dom";
import ProjectGuard from "./ProjectGuard";
import { AppFrame } from "./layout/AppFrame";
import SidebarV2 from "./SidebarV2";
import { isBrandV2 } from "@/lib/brand";

export default function ProjectLayout() {
  // For Brand V2 routes, don't render legacy layout - just pass through children
  if (isBrandV2()) {
    return <ProjectGuard><Outlet /></ProjectGuard>;
  }

  return (
    <ProjectGuard>
      {/* Use AppFrame for consistent header/layout - no duplicate headers */}
      <AppFrame sidebar={<SidebarV2 />}>
        <Outlet />
      </AppFrame>
    </ProjectGuard>
  );
}