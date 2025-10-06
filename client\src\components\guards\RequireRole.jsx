import React from 'react'
import { Redirect } from 'wouter'
import { useOrg } from '../../App'
import { landingFor } from '../../lib/landing'

/**
 * Route guard component that protects routes based on user roles
 * If user doesn't have required role, redirects them to appropriate landing page
 */
export function RequireRole({ allow, fallbackPath, children }) {
  const { userRole } = useOrg()
  
  // If no user role available, redirect to their appropriate landing page (default for undefined role)
  if (!userRole) {
    return <Redirect to={landingFor(userRole)} />
  }
  
  // If user has required role, render the protected content
  if (allow.includes(userRole)) {
    return children
  }
  
  // If user doesn't have required role, redirect to their appropriate landing page
  const redirectPath = fallbackPath || landingFor(userRole)
  return <Redirect to={redirectPath} />
}

/**
 * Convenience components for common role requirements
 */
export const RequirePMOrAdmin = ({ children, fallbackPath }) => (
  <RequireRole 
    allow={['owner', 'org_admin', 'pm_admin', 'admin', 'pm']} 
    fallbackPath={fallbackPath}
  >
    {children}
  </RequireRole>
)

export const RequireAdmin = ({ children, fallbackPath }) => (
  <RequireRole 
    allow={['owner', 'org_admin', 'admin']} 
    fallbackPath={fallbackPath}
  >
    {children}
  </RequireRole>
)

export const RequireOwner = ({ children, fallbackPath }) => (
  <RequireRole 
    allow={['owner']} 
    fallbackPath={fallbackPath}
  >
    {children}
  </RequireRole>
)

export default RequireRole