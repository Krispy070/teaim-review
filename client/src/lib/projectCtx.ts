import { useEffect } from "react";

export function usePersistProjectId(projectId?: string){
  useEffect(()=>{ 
    if (projectId) sessionStorage.setItem("kap.projectId", projectId); 
  },[projectId]);
}

export function getPersistedProjectId(): string | null {
  return sessionStorage.getItem("kap.projectId");
}