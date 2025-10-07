import { useEffect } from "react";
import { Redirect } from "wouter";
import { useOrg } from "../App";
import { landingFor } from "../lib/landing";

export function RoleBasedLanding({ children }) {
  const orgCtx = useOrg();
  const userRole = orgCtx?.userRole;
  
  const landingPath = landingFor(userRole);
  
  // If the landing path is not the root, redirect to the appropriate role-based page
  if (landingPath !== "/") {
    return <Redirect to={landingPath} />;
  }
  
  // Otherwise, render the default dashboard content
  return children;
}