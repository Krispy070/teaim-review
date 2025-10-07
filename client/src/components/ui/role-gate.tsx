import * as React from "react"

type Role = 'owner' | 'admin' | 'pm' | 'lead' | 'member' | 'guest'

export interface RoleGateProps {
  allow: Role[]
  role: string
  children: React.ReactNode
}

export function RoleGate({ allow, role, children }: RoleGateProps) {
  return allow.includes(role as Role) ? <>{children}</> : null
}