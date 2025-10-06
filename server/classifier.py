import json, os
from openai import OpenAI

oai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-4o-mini")

SYSTEM = """You are a Workday implementation PMO classifier.
Return ONLY valid JSON that matches the provided schema. No text before/after.
Extract: workstreams, actions (owner+due), risks (severity), decisions, integrations (name transport frequency),
reporting asks, logistics (cadence/links), metrics, and doc_type."""

SCHEMA_HINT = """Schema:
{
 "doc_type": "...",
 "summary": "...",
 "workstreams":[{"name":"", "confidence":0.0, "action":"add|keep|drop", "description":""}],
 "actions":[{"title":"", "owner_email":"", "due_date":"YYYY-MM-DD", "confidence":0.0}],
 "risks":[{"text":"", "severity":"High|Medium|Low", "confidence":0.0}],
 "decisions":[{"text":"", "decided_on":"YYYY-MM-DD", "confidence":0.0}],
 "integrations":[{"name":"", "transport":"SFTP|API|File|Other", "frequency":"daily|weekly|ad-hoc|other", "confidence":0.0}],
 "reporting_requests":[{"text":"", "confidence":0.0}],
 "logistics":{"cadence":"", "links":["..."], "confidence":0.0},
 "metrics":[{"name":"", "value":"", "confidence":0.0}]
}"""

def classify_text(text: str, project_code: str = "WD-PROJ") -> dict:
    """Extract structured project updates from text using GPT classification"""
    prompt = f"""Project: {project_code}

{SCHEMA_HINT}

Text:
{text[:16000]}"""
    
    try:
        r = oai.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role":"system","content":SYSTEM},{"role":"user","content":prompt}],
            temperature=0
        )
        raw = r.choices[0].message.content.strip()
        
        # Try to parse JSON directly
        try:
            return json.loads(raw)
        except Exception:
            # Salvage by trying to find { ... }
            import re
            m = re.search(r"\{[\s\S]+\}", raw)
            if m:
                return json.loads(m.group(0))
            else:
                raise
                
    except Exception as e:
        # Return empty structure on any failure
        return {
            "doc_type": "other",
            "summary": "",
            "workstreams": [],
            "actions": [],
            "risks": [],
            "decisions": [],
            "integrations": [],
            "reporting_requests": [],
            "logistics": {},
            "metrics": []
        }