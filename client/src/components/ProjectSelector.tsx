import { useProject } from "@/contexts/ProjectContext";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function ProjectSelector() {
  const { selectedProject, projects, setSelectedProject, isLoading } = useProject();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <div className="animate-pulse h-5 w-32 bg-gray-600 rounded"></div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
        No projects found
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="flex items-center gap-2 min-w-[200px] justify-between"
          data-testid="button-project-selector"
        >
          <span className="truncate">
            {selectedProject ? (
              <>
                <span className="font-medium">{selectedProject.code}</span>
                <span className="text-muted-foreground ml-1">- {selectedProject.name}</span>
              </>
            ) : (
              "Select project"
            )}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => setSelectedProject(project)}
            className="flex items-center justify-between cursor-pointer"
            data-testid={`menu-item-project-${project.id}`}
          >
            <div className="flex flex-col">
              <span className="font-medium">{project.code}</span>
              <span className="text-sm text-muted-foreground truncate">{project.name}</span>
            </div>
            {selectedProject?.id === project.id && (
              <Check className="h-4 w-4 ml-2" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
