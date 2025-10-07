import { useLocation } from 'wouter'
import { useOrg } from '@/App'
import { resolveProjectId } from '@/lib/projectId'

/**
 * Standardized hook to get the current project ID with fallback strategy:
 * 1. URL parameters (highest priority)
 * 2. Context from useOrg() 
 * 3. Persisted session storage (lowest priority)
 * 
 * @returns projectId string or null if none available
 */
export function useProjectId(): string | null {
  const [location] = useLocation()
  // Extract projectId from URL path /projects/:projectId/...
  const urlProjectId = location.split('/')[2]
  const org = useOrg()
  
  return resolveProjectId(urlProjectId, org?.projectId)
}

/**
 * Hook that throws an error if no project ID is available.
 * Use this when project ID is required for the component to function.
 * 
 * @returns projectId string (guaranteed to be non-null)
 * @throws Error if no project ID is available
 */
export function useRequiredProjectId(): string {
  const projectId = useProjectId()
  
  if (!projectId) {
    throw new Error('Project ID is required but not available. Ensure this component is used within a project context.')
  }
  
  return projectId
}

/**
 * Hook that provides both project ID and organization context.
 * Useful for components that need both values.
 * 
 * @returns object with projectId, orgId, and other org context
 */
export function useProjectContext() {
  const projectId = useProjectId()
  const org = useOrg()
  
  return {
    projectId,
    orgId: org?.orgId,
    userRole: org?.userRole,
    setProjectId: org?.setProjectId,
    setOrgId: org?.setOrgId,
    setUserRole: org?.setUserRole,
  }
}