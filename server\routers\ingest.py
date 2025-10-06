from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from uuid import uuid4
from datetime import datetime
from ..tenant import TenantCtx
from ..guards import member_ctx
from ..supabase_client import get_user_supabase
from server.workers.extract_tests import extract_tests_sync

router = APIRouter()

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