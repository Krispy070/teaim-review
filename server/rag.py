# /server/rag.py
import os, logging
from openai import OpenAI, APIConnectionError, RateLimitError
from .supabase_client import get_supabase_client
from .db import get_conn

sb = get_supabase_client()

# Short timeouts so the request never hangs the UI
OPENAI_TIMEOUT = int(os.getenv("OPENAI_TIMEOUT_SEC", "15"))
oai = OpenAI(timeout=OPENAI_TIMEOUT)

EMBED_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")
CHAT_MODEL  = os.getenv("CHAT_MODEL", "gpt-4o-mini")

def embed_texts(texts):
    try:
        resp = oai.embeddings.create(model=EMBED_MODEL, input=texts)
        return [d.embedding for d in resp.data]
    except Exception as e:
        logging.exception("embed_texts failed")
        raise

def _rpc_search(org_id, project_id, q_emb, k):
    return sb.rpc("search_chunks", {
        "k": k, "p_org": org_id, "p_project": project_id, "q": q_emb
    }).execute().data

def _psycopg_fallback(org_id, project_id, q_emb, k):
    with get_conn() as conn, conn.cursor() as cur:
        # Format embedding as pgvector literal
        emb_literal = f"[{','.join(map(str, q_emb))}]"
        cur.execute(
            """
            select c.content, a.title, a.id
            from artifact_chunks c
            join artifacts a on a.id = c.artifact_id
            where c.org_id = %s and c.project_id = %s
            order by c.embedding <#> %s
            limit %s
            """,
            (org_id, project_id, emb_literal, k),
        )
        rows = cur.fetchall()
        return [{"content": r[0], "title": r[1], "artifact_id": str(r[2])} for r in rows]

def answer_with_citations(org_id: str, project_id: str, question: str, k: int = 8):
    # If no chunks in this project, return immediately (no OpenAI call)
    try:
        chk = sb.table("artifact_chunks").select("id").eq("org_id", org_id).eq("project_id", project_id).limit(1).execute().data
        if not chk:
            return ("I don't see any indexed documents for this project yet. "
                    "Upload a file (SOW, minutes, or transcript) and ask again.", [])
    except Exception:
        # If Supabase hiccups, continue; worst case we try and fail gracefully below
        pass

    # Embed the question
    try:
        q_emb = embed_texts([question])[0]
    except Exception:
        return ("I couldn't reach the embeddings service right now. Try again in a bit, "
                "or upload another document.", [])

    # Retrieve via RPC then fallback
    res = []
    try:
        res = _rpc_search(org_id, project_id, q_emb, k) or []
    except Exception:
        try:
            res = _psycopg_fallback(org_id, project_id, q_emb, k)
        except Exception:
            logging.exception("Both RPC and psycopg fallback failed")
            res = []

    # If no context, don't waste an LLM call—reply helpfully
    if not res:
        return ("I didn't find relevant context yet. Upload a doc or give me a more specific question "
                "(e.g., 'What are the payroll retro rules from last standup?').", [])

    # Build context and ask Kap
    context = "\n\n".join([f"[Artifact: {r['title']}] \n{r['content']}" for r in res])
    sys = ("You are Kap, a seasoned Workday program director. "
           "Answer ONLY from the provided context. Cite sources as [Artifact: Title]. "
           "If insufficient, say so and suggest next steps.")
    u = f"Question: {question}\n\nContext:\n{context[:20000]}"
    try:
        comp = oai.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role":"system","content":sys},{"role":"user","content":u}],
            temperature=0.2
        )
        return comp.choices[0].message.content, res
    except (APIConnectionError, RateLimitError, Exception):
        logging.exception("chat completion failed")
        return ("I hit a problem calling the model just now. The rest of the system is fine—try again in a minute.", res)