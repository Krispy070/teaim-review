// Map to existing role system from schema
export type Role =
  | "owner"
  | "admin" 
  | "pm"
  | "lead"
  | "member"
  | "guest";

export type RoleScopes = {
  areas?: string[];       // e.g., ["HCM","FIN"]
  projectId?: string;     // explicit lock to a project
};

export type Me = {
  id: string;
  email: string;
  role: Role;
  roleScopes?: RoleScopes;
  orgType?: "customer" | "partner";
  defaultProjectId?: string;
};

export const homeForRole = (me: Me): string => {
  const pid = me.roleScopes?.projectId || me.defaultProjectId || "current";
  switch (me.role) {
    case "owner": return "/home/admin";
    case "admin": return "/home/admin";
    case "pm": return `/home/pm/${pid}`;
    case "lead": return `/home/functional/${pid}`;
    case "member": return `/home/worker/${pid}`;
    case "guest": return `/home/worker/${pid}`;
    default: return `/dashboard`;
  }
};