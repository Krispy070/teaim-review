import ProjectGuard from "./ProjectGuard";
import { AppFrame } from "./layout/AppFrame";
import SidebarV2 from "./SidebarV2";
import { isBrandV2 } from "@/lib/brand";

interface ProjectLayoutProps {
  children: React.ReactNode;
}

export default function ProjectLayout({ children }: ProjectLayoutProps) {
  // For Brand V2 routes, don't render legacy layout - just pass through children
  if (isBrandV2()) {
    return <ProjectGuard>{children}</ProjectGuard>;
  }

  return (
    <ProjectGuard>
      {/* Use AppFrame for consistent header/layout - no duplicate headers */}
      <AppFrame sidebar={<SidebarV2 />}>
        {children}
      </AppFrame>
    </ProjectGuard>
  );
}