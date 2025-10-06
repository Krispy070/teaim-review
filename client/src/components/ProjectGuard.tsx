import { useEffect } from "react";
import { useLocation } from "wouter";
import { resolveProjectId } from "@/lib/projectId";
import { getPersistedProjectId } from "@/lib/projectCtx";

export default function ProjectGuard({ children }: { children: any }) {
  const [location, setLocation] = useLocation();
  // Extract projectId from current location path
  const pathSegments = location.split('/');
  const projectsIndex = pathSegments.indexOf('projects');
  const projectIdFromPath = projectsIndex >= 0 && projectsIndex + 1 < pathSegments.length ? pathSegments[projectsIndex + 1] : undefined;
  const pid = resolveProjectId(projectIdFromPath, undefined);

  useEffect(() => {
    // If route has :projectId but it's missing or "undefined", repair it.
    const hasProjectSlot = location.includes("/projects/") && !location.includes("/projects/select");
    if (hasProjectSlot && (!pid || pid === "undefined")) {
      const stored = getPersistedProjectId();
      if (stored) {
        // rewrite current path to include stored pid using regex to handle any malformed projectId
        const fixed = location.replace(/\/projects\/[^/]*/, `/projects/${stored}`);
        setLocation(fixed);
      } else {
        setLocation("/projects/select");
      }
    }
  // eslint-disable-next-line
  }, [location]);

  return children;
}