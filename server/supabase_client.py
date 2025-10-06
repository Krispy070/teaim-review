import os
import logging
from supabase import create_client, Client
from typing import Optional, Any, Dict, List
from postgrest.exceptions import APIError

# Initialize Supabase client
def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not service_role_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    
    return create_client(url, service_role_key)

def get_supabase_storage_client():
    client = get_supabase_client()
    bucket_name = os.getenv("BUCKET", "project-artifacts")
    return client.storage.from_(bucket_name)

def get_user_supabase(ctx) -> Client:
    """Create a user-scoped Supabase client that respects RLS using the user's JWT"""
    from fastapi import HTTPException
    
    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not anon_key:
        raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set for user-scoped operations")
    
    # Dev mode: Use service role client for org/project-scoped reads
    # This allows dev operations without requiring JWT while maintaining security
    dev_auth = os.getenv("DEV_AUTH", "0") == "1"
    if dev_auth and not ctx.jwt:
        if not service_role_key:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY required for dev mode operations")
        # Use service role for dev mode - bypasses RLS but dev is already authenticated via X-Dev headers
        return create_client(url, service_role_key)
    
    # Production: Require JWT for RLS enforcement
    if not ctx.jwt:
        raise HTTPException(401, "User JWT required for user-scoped database operations")
    
    client = create_client(url, anon_key)
    client.postgrest.auth(ctx.jwt)  # Apply user JWT so RLS filters correctly
    return client


def safe_execute(query, default_value=None, log_missing_table=True):
    """
    Safe wrapper for Supabase execute() calls that handles PGRST205 (table not found) errors
    and returns empty defaults instead of throwing 500 errors.
    
    Args:
        query: The Supabase query to execute
        default_value: Value to return on error (defaults to [] for lists, {} for single records)
        log_missing_table: Whether to log missing table warnings
    
    Returns:
        Query result data or default_value on error
    """
    try:
        result = query.execute()
        return result.data
    except APIError as e:
        error_code = e.details.get('code') if hasattr(e, 'details') and e.details else getattr(e, 'code', None)
        
        if error_code == 'PGRST205':
            # Table not found - this is common in development/testing environments
            if log_missing_table:
                table_hint = "unknown"
                if hasattr(query, '_table') and query._table:
                    table_hint = query._table
                logging.warning(f"Table not found (PGRST205), returning empty result for table: {table_hint}")
            
            # Return appropriate default based on query type or explicit default
            if default_value is not None:
                return default_value
            
            # Try to infer if this is a single record query or list query
            query_str = str(query) if hasattr(query, '__str__') else ""
            if '.single()' in query_str or '.limit(1)' in query_str:
                return {}  # Single record queries return empty dict
            else:
                return []  # List queries return empty array
        else:
            # Re-raise other API errors
            logging.error(f"Supabase API error (non-PGRST205): {e}")
            raise
    except Exception as e:
        # Re-raise other exceptions
        logging.error(f"Unexpected error in safe_execute: {e}")
        raise
