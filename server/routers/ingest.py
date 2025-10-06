from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
from uuid import uuid4
from datetime import datetime
import tempfile
import os
import shutil
import io
from pypdf import PdfReader
from docx import Document as Docx
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase, get_supabase_storage_client
from ..parsing import extract_text_from_file
from ..chunking import chunk_text
from ..rag import embed_texts
from server.workers.extract_tests import extract_tests_sync

router = APIRouter()

# Local storage directory for ingested docs
STORAGE_DIR = os.getenv("INGEST_STORAGE_DIR", "/tmp/ingest")
os.makedirs(STORAGE_DIR, exist_ok=True)

def _pdf_meta_bytes(b: bytes) -> dict:
    try:
        reader = PdfReader(io.BytesIO(b))
        md = reader.metadata or {}
        return {k.replace("/", "").lower(): str(v) for k, v in dict(md).items()}
    except Exception:
        return {}

def _docx_meta_bytes(b: bytes) -> dict:
    try:
        props = Docx(io.BytesIO(b)).core_properties
        return {
            "title": props.title,
            "subject": props.subject,
            "author": props.author,
            "created": str(props.created) if props.created else None,
        }
    except Exception:
        return {}

class IngestTranscriptBody(BaseModel):
    project_id: str
    title: str
    content: str
    source: str = "api"
    meeting_date: Optional[str] = None
    metadata: Optional[dict] = None

class IngestTranscriptResponse(BaseModel):
    ok: bool
    transcript_id: str
    message: str
    tests_extracted: Optional[int] = None

@router.post("/ingest/transcript")
async def ingest_transcript(
    body: IngestTranscriptBody,
    background_tasks: BackgroundTasks,
    ctx: TenantCtx = Depends(member_ctx)
) -> IngestTranscriptResponse:
    """Ingest a transcript and extract test candidates using LLM"""
    
    try:
        # Generate transcript ID
        transcript_id = str(uuid4())
        
        # Save transcript to artifacts table (following existing pattern)
        transcript_record = {
            "id": transcript_id,
            "org_id": ctx.org_id,
            "project_id": body.project_id,
            "title": body.title,
            "path": f"transcripts/{transcript_id}.txt",
            "mime_type": "text/plain",
            "source": body.source,
            "meeting_date": body.meeting_date,
            "metadata": body.metadata or {},
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Insert transcript record
        sb = get_user_supabase(ctx)
        sb.table("artifacts").insert(transcript_record).execute()
        
        # Queue test extraction as background task
        background_tasks.add_task(
            extract_and_stage_tests,
            ctx.org_id,
            body.project_id,
            transcript_id,
            body.content
        )
        
        return IngestTranscriptResponse(
            ok=True,
            transcript_id=transcript_id,
            message=f"Transcript ingested successfully. Test extraction queued.",
            tests_extracted=None  # Will be determined by background task
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest transcript: {str(e)}")

@router.post("/ingest/transcript/sync")
async def ingest_transcript_sync(
    body: IngestTranscriptBody,
    ctx: TenantCtx = Depends(member_ctx)
) -> IngestTranscriptResponse:
    """Ingest a transcript and extract test candidates synchronously (for testing)"""
    
    try:
        # Generate transcript ID
        transcript_id = str(uuid4())
        
        # Save transcript to artifacts table
        transcript_record = {
            "id": transcript_id,
            "org_id": ctx.org_id,
            "project_id": body.project_id,
            "title": body.title,
            "path": f"transcripts/{transcript_id}.txt",
            "mime_type": "text/plain",
            "source": body.source,
            "meeting_date": body.meeting_date,
            "metadata": body.metadata or {},
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Insert transcript record
        sb = get_user_supabase(ctx)
        sb.table("artifacts").insert(transcript_record).execute()
        
        # Extract tests synchronously
        result = extract_tests_sync(
            ctx.org_id,
            body.project_id,
            transcript_id,
            body.content
        )
        
        if not result.get("ok"):
            raise HTTPException(status_code=500, detail=f"Test extraction failed: {result.get('error', 'Unknown error')}")
        
        return IngestTranscriptResponse(
            ok=True,
            transcript_id=transcript_id,
            message=f"Transcript ingested and {result.get('count', 0)} tests extracted successfully.",
            tests_extracted=result.get("count", 0)
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest transcript: {str(e)}")

async def extract_and_stage_tests(org_id: str, project_id: str, transcript_id: str, content: str):
    """Background task to extract tests from transcript content"""
    try:
        result = extract_tests_sync(org_id, project_id, transcript_id, content)
        
        if result.get("ok"):
            print(f"✅ Extracted {result.get('count', 0)} tests from transcript {transcript_id}")
        else:
            print(f"❌ Failed to extract tests from transcript {transcript_id}: {result.get('error')}")
            
    except Exception as e:
        print(f"❌ Background test extraction failed for transcript {transcript_id}: {str(e)}")


class IngestDocResponse(BaseModel):
    ok: bool
    doc_id: str
    filename: str
    message: str
    chunks_created: int = 0


@router.get("/ingest/check-filename")
async def check_filename(
    project_id: str,
    filename: str,
    ctx: TenantCtx = Depends(member_ctx)
):
    """Check if a document with the given filename already exists in the project (excluding soft-deleted)"""
    try:
        sb = get_user_supabase(ctx)
        
        # Query docs table for filename in this project, excluding soft-deleted documents
        response = sb.table("docs").select("id, name, deleted_at").eq("project_id", project_id).eq("name", filename).execute()
        
        # Debug: print what we got
        print(f"🔍 check-filename query returned {len(response.data)} docs for '{filename}'")
        for doc in response.data:
            print(f"  Doc {doc['id']}: deleted_at={doc.get('deleted_at')}, type={type(doc.get('deleted_at'))}")
        
        # Filter out soft-deleted documents (where deleted_at is not None)
        active_docs = [doc for doc in response.data if doc.get('deleted_at') is None]
        exists = len(active_docs) > 0
        
        print(f"  After filtering: {len(active_docs)} active docs, exists={exists}")
        
        return {
            "exists": exists,
            "message": f"File '{filename}' already exists in this project" if exists else "Filename is available"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check filename: {str(e)}")

@router.post("/ingest/doc")
async def ingest_document_simple(
    file: UploadFile = File(...),
    orgId: str = Form(...),
    projectId: str = Form(...)
):
    """
    Simplified document ingestion - saves file locally, extracts text and metadata, returns data.
    DB persistence and embedding is handled by Express proxy route.
    """
    try:
        doc_id = str(uuid4())
        safe_name = f"{doc_id}__{file.filename}"
        dest = os.path.join(STORAGE_DIR, safe_name)
        
        # Read file bytes
        raw = await file.read()
        
        # Save file to local storage
        with open(dest, "wb") as buffer:
            buffer.write(raw)
        
        # Extract text from the file
        extracted_text, error = extract_text_from_file(dest, file.content_type or "application/octet-stream")
        
        # Extract metadata from PDF/DOCX files
        ct = (file.content_type or "").lower()
        name = (file.filename or "").lower()
        meta = {}
        
        try:
            if ct.endswith("pdf") or name.endswith(".pdf"):
                meta = {**meta, **_pdf_meta_bytes(raw)}
            elif "word" in ct or name.endswith(".docx"):
                meta = {**meta, **_docx_meta_bytes(raw)}
        except Exception as e:
            print(f"Failed to extract metadata: {str(e)}")
        
        # Cap extracted text at 2MB for safety
        if extracted_text:
            extracted_text = extracted_text[:2_000_000]
        
        return {
            "ok": True,
            "docId": doc_id,
            "filename": file.filename,
            "mime": file.content_type or "application/octet-stream",
            "sizeBytes": str(len(raw)),
            "storagePath": dest,
            "orgId": orgId,
            "projectId": projectId,
            "extractedText": extracted_text,
            "extractionError": error,
            "meta": meta
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest document: {str(e)}")