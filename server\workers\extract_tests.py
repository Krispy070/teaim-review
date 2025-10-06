import hashlib
import json
import uuid
from typing import List, Dict, Any, Optional
from openai import OpenAI
from datetime import datetime
from server.supabase_client import get_supabase_client
import os

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def make_dedupe_key(test_data: Dict[str, Any]) -> str:
    """Generate deduplication key from test content"""
    area_key = test_data.get("area_key", "") or ""
    bp_code = test_data.get("bp_code", "") or ""
    title = test_data.get("title", "")
    
    base = f"{area_key}|{bp_code}|{title}".lower().strip()
    return hashlib.sha1(base.encode('utf-8')).hexdigest()

async def extract_tests_from_transcript(
    org_id: str,
    project_id: str, 
    transcript_id: str, 
    text: str
) -> Dict[str, Any]:
    """Extract test cases from transcript text using LLM and store in staging_tests"""
    
    # System prompt for test extraction
    system_prompt = """You extract test cases from meeting transcripts and conversations. 
Output valid JSON only with a 'tests' array containing test case objects.

Each test should have:
- title: Clear, concise test name
- gherkin: Full Gherkin scenario (Given/When/Then format)
- steps: Array of step strings
- areaKey: Workday functional area (optional)
- bpCode: Business process code (optional) 
- priority: P1/P2/P3/P4
- type: happy/sad/edge/regression
- ownerHint: Suggested test owner (optional)
- tags: Array of relevant tags
- trace: Array of transcript quotes supporting this test
- confidence: Float 0.0-1.0 indicating extraction confidence
- dedupeKey: Optional unique key for deduplication"""

    user_prompt = f"""Transcript:
{text}

Rules: 
- Whenever a change, process, or capability is discussed, produce at least one test
- Focus on user workflows and business scenarios
- Include both happy path and error cases where mentioned
- Extract specific details mentioned in the conversation"""

    try:
        # Make OpenAI API call
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        # Parse response
        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)
        tests = parsed.get("tests", [])
        
        if not isinstance(tests, list):
            tests = []
            
    except Exception as e:
        print(f"LLM extraction failed: {str(e)}")
        return {"ok": False, "error": str(e), "count": 0}
    
    # Use service Supabase client
    supabase = get_supabase_client()
    inserted_count = 0
    
    for test_data in tests:
        try:
            # Generate deduplication key
            dedupe_key = test_data.get("dedupeKey") or make_dedupe_key(test_data)
            
            # Prepare record for insertion
            record = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "project_id": project_id,
                "transcript_id": transcript_id,
                "dedupe_key": dedupe_key,
                "title": test_data.get("title", "Untitled Test"),
                "gherkin": test_data.get("gherkin", ""),
                "steps": test_data.get("steps", []),
                "area_key": test_data.get("areaKey"),
                "bp_code": test_data.get("bpCode"),
                "priority": test_data.get("priority", "P2"),
                "type": test_data.get("type", "happy"),
                "owner_hint": test_data.get("ownerHint"),
                "tags": test_data.get("tags", []),
                "trace": test_data.get("trace", [test_data.get("title", "")]),
                "confidence": int((test_data.get("confidence", 0.75) * 100)),
                "created_at": datetime.utcnow().isoformat()
            }
            
            # Upsert with deduplication
            result = supabase.table("staging_tests").upsert(
                record,
                on_conflict="org_id,project_id,dedupe_key"
            ).execute()
            
            if result.data:
                inserted_count += 1
                
        except Exception as e:
            print(f"Failed to insert test {test_data.get('title', 'Unknown')}: {str(e)}")
            continue
    
    return {
        "ok": True, 
        "count": inserted_count,
        "total_extracted": len(tests)
    }

def extract_tests_sync(org_id: str, project_id: str, transcript_id: str, text: str) -> Dict[str, Any]:
    """Synchronous wrapper for extract_tests_from_transcript"""
    import asyncio
    
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(
        extract_tests_from_transcript(org_id, project_id, transcript_id, text)
    )