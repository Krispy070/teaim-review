import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { deriveProjectId, setStoredProjectId } from "@/lib/project";
import { fetchWithAuth } from "@/lib/supabase";

export interface Project {
  id: string;
  code?: string;
  name?: string;
}

type Ctx = {
  projectId: string | null;
  project?: Project | null;
  setProjectId: (pid: string) => void;
  projects: Project[];
  refresh: () => Promise<void>;
  // Legacy compatibility
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
  isLoading: boolean;
  refreshProjects: () => Promise<void>;
};

const ProjectContext = createContext<Ctx>({
  projectId: null,
  setProjectId: () => {},
  projects: [],
  refresh: async () => {},
  selectedProject: null,
  setSelectedProject: () => {},
  isLoading: false,
  refreshProjects: async () => {},
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState<string | null>(deriveProjectId());
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setProjectId = (pid: string) => {
    setStoredProjectId(pid);
    setProjectIdState(pid);
  };

  const refresh = async () => {
    try {
      setIsLoading(true);
      // Get org_id from dev auth or env
      const devAuth = JSON.parse(localStorage.getItem('kap.devAuth') || 'null');
      const orgId = devAuth?.org || import.meta.env.VITE_DEV_ORG || '87654321-4321-4321-4321-cba987654321';
      const pid = projectId || '';
      
      // guardFetch returns parsed JSON on success, throws on error
      const j = await fetchWithAuth(`/api/projects/list?org_id=${orgId}${pid ? `&project_id=${pid}` : ''}`);
      const list: Project[] = j.items || j.projects || [];
      setProjects(list);
      const current = projectId || (list[0]?.id || null);
      if (!projectId && current) setProjectId(current);
      setProject(list.find(p => p.id === current) || null);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Legacy compatibility
  const setSelectedProject = (p: Project | null) => {
    if (p?.id) setProjectId(p.id);
  };

  return (
    <ProjectContext.Provider
      value={{
        projectId,
        project,
        projects,
        setProjectId,
        refresh,
        selectedProject: project,
        setSelectedProject,
        isLoading,
        refreshProjects: refresh,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
