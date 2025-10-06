# /server/db.py
import os
import psycopg2
import psycopg2.extras

def get_conn():
    # Try local PostgreSQL first, fall back to Supabase
    dsn = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL or SUPABASE_DB_URL not set")
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    # Register JSON adapter for list types
    try:
        psycopg2.extras.register_adapter(dict, psycopg2.extras.Json)
        psycopg2.extras.register_adapter(list, psycopg2.extras.Json)
    except AttributeError:
        # Fallback if register_adapter doesn't exist
        pass
    return conn

def insert_artifact(conn, org_id, project_id, path, mime_type, title, source, meeting_date=None):
    """Insert artifact and return the ID"""
    with conn.cursor() as cur:
        cur.execute("""
            insert into artifacts (org_id, project_id, path, mime_type, title, source, meeting_date)
            values (%s,%s,%s,%s,%s,%s,%s)
            returning id
        """, (org_id, project_id, path, mime_type, title, source, meeting_date))
        return cur.fetchone()[0]

def update_artifact_chunk_count(conn, artifact_id, n):
    """Update the chunk count for an artifact"""
    with conn.cursor() as cur:
        cur.execute("update artifacts set chunk_count=%s where id=%s", (n, artifact_id))

def insert_chunks(conn, org_id, project_id, artifact_id, rows):
    """Insert chunks in batch via psycopg2"""
    # rows: list of dicts with content, embedding, chunk_index
    with conn.cursor() as cur:
        cur.executemany("""
            insert into artifact_chunks (org_id, project_id, artifact_id, chunk_index, content, embedding)
            values (%s,%s,%s,%s,%s,%s)
        """, [
            (org_id, project_id, artifact_id, r["chunk_index"], r["content"], r["embedding"])
            for r in rows
        ])

def insert_summary(conn, org_id, project_id, artifact_id, summary):
    """Insert a summary for an artifact"""
    with conn.cursor() as cur:
        cur.execute("""
            insert into summaries (org_id, project_id, artifact_id, level, summary)
            values (%s,%s,%s,'artifact',%s)
        """, (org_id, project_id, artifact_id, summary))