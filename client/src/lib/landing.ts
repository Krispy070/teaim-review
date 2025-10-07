/**
 * Role-based landing page helper
 * Determines the appropriate landing path based on user role
 */
export function landingFor(role?: string): string {
  return "/";
}

/**
 * Check if a role has access to PM/Admin features
 */
export function hasAdminAccess(role?: string): boolean {
  return ["owner", "org_admin", "pm_admin", "admin", "pm"].includes(role || "");
}

/**
 * Check if a role has access to organization-level admin features
 */
export function hasOrgAdminAccess(role?: string): boolean {
  return ["owner", "org_admin", "admin"].includes(role || "");
}

/**
 * Get the default "home" label for a given role
 */
export function getHomeLabelFor(role?: string): string {
  switch (role) {
    case "owner":
    case "org_admin":
    case "admin":
      return "Admin Home";
    case "pm_admin":
    case "pm":
      return "PM Home";
    default:
      return "Dashboard";
  }
}