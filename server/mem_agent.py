import openai
import json
from typing import Dict, List, Any
from .models import MemoryExtraction

# the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
CHAT_MODEL = "gpt-5"

async def extract_memories_from_text(text: str, artifact_title: str = "") -> MemoryExtraction:
    """
    Extract different types of memories from text using OpenAI
    """
    client = openai.AsyncOpenAI()
    
    prompt = f"""
    Analyze the following text from a Workday implementation project document and extract memories in JSON format.
    
    Document title: {artifact_title}
    Text: {text}
    
    Extract the following types of memories:
    
    1. Episodic: Specific events, meetings, dates, milestones
    2. Semantic: Facts, concepts, definitions, rules, requirements
    3. Procedural: Step-by-step processes, workflows, instructions
    4. Decision: Decisions made, approvals, sign-offs, choices
    5. Affect: Sentiment, concerns, risks, excitement, team morale indicators
    
    Return JSON in this exact format:
    {{
        "episodic": [
            {{"event": "description", "date": "if mentioned", "participants": ["if mentioned"], "context": "additional context"}}
        ],
        "semantic": [
            {{"concept": "name", "definition": "explanation", "category": "workday_module|process|requirement|other"}}
        ],
        "procedural": [
            {{"process": "name", "steps": ["step1", "step2"], "triggers": ["when to use"], "outcomes": ["expected results"]}}
        ],
        "decision": [
            {{"decision": "what was decided", "rationale": "why", "decider": "who", "date": "when", "impact": "consequences"}}
        ],
        "affect": [
            {{"sentiment": "positive|negative|neutral", "emotion": "specific emotion", "source": "what caused it", "intensity": "low|medium|high"}}
        ]
    }}
    """
    
    try:
        response = await client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert at analyzing Workday implementation documents and extracting structured memory information."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        return MemoryExtraction(**result)
    
    except Exception as e:
        # Return empty memories if extraction fails
        return MemoryExtraction(
            episodic=[],
            semantic=[],
            procedural=[],
            decision=[],
            affect=[]
        )

async def generate_summary_with_extractions(text: str, artifact_title: str = "") -> Dict[str, Any]:
    """
    Generate summary and extract risks, decisions, actions from text
    """
    client = openai.AsyncOpenAI()
    
    prompt = f"""
    Analyze this Workday implementation document and provide a comprehensive analysis in JSON format.
    
    Document title: {artifact_title}
    Text: {text}
    
    Provide:
    1. A concise summary of the document
    2. Identified risks with severity and mitigation strategies
    3. Decisions made or required
    4. Action items with owners and due dates if mentioned
    
    Return JSON in this format:
    {{
        "summary": "brief summary of the document",
        "risks": [
            {{"risk": "description", "severity": "low|medium|high", "category": "technical|timeline|resource|other", "mitigation": "suggested approach"}}
        ],
        "decisions": [
            {{"decision": "what needs to be decided or was decided", "status": "pending|made", "impact": "business impact", "stakeholders": ["who is involved"]}}
        ],
        "actions": [
            {{"action": "what needs to be done", "owner": "who should do it", "verb": "action verb", "due_date": "when due if mentioned", "priority": "low|medium|high"}}
        ],
        "provenance": {{"source": "{artifact_title}", "extraction_method": "openai_gpt5", "confidence": "0.0-1.0"}}
    }}
    """
    
    try:
        response = await client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert Workday implementation consultant analyzing project documents."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        return json.loads(response.choices[0].message.content)
    
    except Exception as e:
        # Return minimal structure if extraction fails
        return {
            "summary": f"Failed to analyze document: {str(e)}",
            "risks": [],
            "decisions": [],
            "actions": [],
            "provenance": {"source": artifact_title, "extraction_method": "failed", "confidence": 0.0}
        }

def calculate_wellness_score(buckets: Dict[str, int]) -> int:
    """
    Calculate wellness score from sentiment buckets
    Returns score 1-5 (1=very negative, 5=very positive)
    """
    total = sum(buckets.values())
    if total == 0:
        return 3  # neutral
    
    weighted_sum = (
        buckets.get("very_negative", 0) * 1 +
        buckets.get("negative", 0) * 2 +
        buckets.get("neutral", 0) * 3 +
        buckets.get("positive", 0) * 4 +
        buckets.get("very_positive", 0) * 5
    )
    
    return round(weighted_sum / total)

def should_create_wellness_signal(current_score: int, previous_scores: List[int], threshold: int = 2) -> bool:
    """
    Determine if a wellness signal should be created based on score trends
    """
    if len(previous_scores) < 2:
        return False
    
    # Check for significant drop
    recent_avg = sum(previous_scores[-2:]) / 2
    return current_score < recent_avg - threshold
