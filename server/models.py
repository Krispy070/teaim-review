from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    PM = "pm"
    LEAD = "lead"
    MEMBER = "member"
    GUEST = "guest"

class ProjectStatus(str, Enum):
    DISCOVERY = "discovery"
    DESIGN = "design"
    CONFIG = "config"
    TEST = "test"
    DEPLOY = "deploy"
    COMPLETE = "complete"

class ActionStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERDUE = "overdue"

class MemoryType(str, Enum):
    EPISODIC = "episodic"
    SEMANTIC = "semantic"
    PROCEDURAL = "procedural"
    DECISION = "decision"
    AFFECT = "affect"

# Request/Response models
class IngestRequest(BaseModel):
    org_id: str
    project_id: str

class AskRequest(BaseModel):
    org_id: str
    project_id: str
    question: str
    k: int = 8

class AskResponse(BaseModel):
    answer: str
    citations: List[Dict[str, str]]
    context_sufficient: bool

class WellnessPulseRequest(BaseModel):
    org_id: str
    project_id: str
    week_label: str
    buckets: Dict[str, int]  # very_negative, negative, neutral, positive, very_positive

class ActionNudgeRequest(BaseModel):
    org_id: str
    project_id: str
    action_id: str

class ActionNudgeResponse(BaseModel):
    subject: str
    body: str

class DigestResponse(BaseModel):
    json_data: Dict[str, Any]
    html_template: str

class SummaryData(BaseModel):
    summary: str
    risks: List[Dict[str, Any]]
    decisions: List[Dict[str, Any]]
    actions: List[Dict[str, Any]]
    provenance: Dict[str, Any]

class MemoryExtraction(BaseModel):
    episodic: List[Dict[str, Any]]
    semantic: List[Dict[str, Any]]
    procedural: List[Dict[str, Any]]
    decision: List[Dict[str, Any]]
    affect: List[Dict[str, Any]]
