import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authFetch } from '@/lib/authFetch';

export interface Project {
  id: string;
  code: string;
  name: string;
}

interface ProjectContextType {
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  isLoading: boolean;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const STORAGE_KEY = 'teaim.selected_project';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProjectState] = useState<Project | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const setSelectedProject = (project: Project | null) => {
    setSelectedProjectState(project);
    if (project) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const refreshProjects = async () => {
    try {
      setIsLoading(true);
      // Get org_id from dev auth or env
      const devAuth = JSON.parse(localStorage.getItem('kap.devAuth') || 'null');
      const orgId = devAuth?.org || import.meta.env.VITE_DEV_ORG || '87654321-4321-4321-4321-cba987654321';
      
      const response = await authFetch(`/api/projects/list?org_id=${orgId}`);
      
      if (!response.ok) {
        console.error('Failed to fetch projects, status:', response.status);
        return;
      }
      
      const data = await response.json();
      setProjects(data.items || []);
      
      // Auto-select first project if none is selected
      if (!selectedProject && data.items && data.items.length > 0) {
        setSelectedProject(data.items[0]);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  return (
    <ProjectContext.Provider value={{ selectedProject, setSelectedProject, projects, setProjects, isLoading, refreshProjects }}>
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
