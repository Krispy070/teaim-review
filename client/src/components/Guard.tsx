import { PropsWithChildren } from "react";
import { useUserRole } from "@/lib/role";

export default function Guard({ need="member", fallback=null, children }:{
  need?: "viewer"|"member"|"admin";
  fallback?: any;
} & PropsWithChildren) {
  const role = useUserRole();
  const rank = { viewer:1, member:2, admin:3 } as const;
  if (rank[role] < rank[need]) return fallback ?? <div className="p-6 text-sm opacity-70">You don't have access to this page.</div>;
  return children;
}
