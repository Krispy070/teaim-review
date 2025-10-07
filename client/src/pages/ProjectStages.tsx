import { StageTracker } from '@/components/StageTracker';
import { useOrg } from '../App';

interface ProjectStagesProps {
  projectId?: string;
}

export default function ProjectStages({ projectId: propProjectId }: ProjectStagesProps = {}) {
  const { projectId: contextProjectId } = useOrg() || {};
  
  // Use props if provided, otherwise fall back to context
  const projectId = propProjectId || contextProjectId;

  // For now, assuming role-based permissions - in a real app this would come from auth
  // These would typically be determined from user authentication/authorization
  const canPM = true; // User has PM or admin role
  const canSign = false; // User has customer_signer role

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold" data-testid="page-title">Project Stage Sign-Off</h1>
        <p className="text-muted-foreground">
          Manage project stages and approval workflow. Project managers can create stages and request sign-offs, 
          while authorized signers can approve or reject stages.
        </p>
      </div>
      
      <StageTracker 
        projectId={projectId || ''} 
        canPM={canPM} 
        canSign={canSign} 
      />
    </div>
  );
}