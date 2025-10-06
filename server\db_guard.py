from fastapi import Depends
from typing import Optional
from .supabase_client import get_supabase_client

class ScopedDB:
    """Database wrapper that automatically applies org_id and project_id filters"""
    
    def __init__(self, sb, org_id: str, project_id: Optional[str] = None):
        self.sb = sb
        self.org_id = org_id
        self.project_id = project_id

    def table(self, name: str):
        """Get a table query with automatic org/project filtering"""
        q = self.sb.table(name).eq("org_id", self.org_id)
        
        # Apply project_id filter if provided and table has project_id column
        if self.project_id:
            # List of tables that have project_id column
            project_tables = [
                "projects", "artifacts", "artifact_chunks", "summaries", "actions",
                "mem_entries", "mem_chunks", "mem_stats", "mem_signals", "workstreams",
                "project_exports", "project_contacts", "project_stages", "audit_events"
            ]
            if name in project_tables:
                q = q.eq("project_id", self.project_id)
        
        return q

def scoped_db(org_id: str, project_id: Optional[str] = None, sb=Depends(get_supabase_client)) -> ScopedDB:
    """Create a scoped database instance that auto-filters by org and project"""
    return ScopedDB(sb, org_id, project_id)

def project_scoped_db(org_id: str, project_id: str, sb=Depends(get_supabase_client)) -> ScopedDB:
    """Create a project-scoped database instance"""
    return ScopedDB(sb, org_id, project_id)