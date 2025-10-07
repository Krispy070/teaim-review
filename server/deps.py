"""
Dependency injection utilities for FastAPI application.
Provides shared database clients and service instances.
"""

import os
from .supabase_client import get_supabase_client

def get_service_supabase():
    """
    Get a Supabase client instance configured with service role credentials.
    
    This bypasses Row Level Security (RLS) and allows for administrative operations.
    Used by background tasks, schedulers, and admin operations that need elevated access.
    
    Returns:
        supabase.Client: Configured Supabase client with service role access
    """
    return get_supabase_client()