from fastapi import APIRouter

router = APIRouter(prefix="/api/stages", tags=["stages"])

TEMPLATES = {
  "workday_core": [
    {"title":"Discovery","area":"HCM","duration_weeks":4,"start_offset_weeks":0},
    {"title":"Build P1","area":"HCM","duration_weeks":8,"start_offset_weeks":4},
    {"title":"Test","area":"HCM","duration_weeks":6,"start_offset_weeks":12},
    {"title":"Cutover","area":"HCM","duration_weeks":2,"start_offset_weeks":18},
  ],
  "workday_payroll_finance": [
    {"title":"Discovery","area":"Payroll","duration_weeks":6,"start_offset_weeks":0},
    {"title":"Build P1","area":"Payroll","duration_weeks":10,"start_offset_weeks":6},
    {"title":"Test","area":"Payroll","duration_weeks":8,"start_offset_weeks":16},
    {"title":"Cutover","area":"Payroll","duration_weeks":3,"start_offset_weeks":24},
    {"title":"GL Alignment","area":"Financials","duration_weeks":4,"start_offset_weeks":20},
  ],
  "workday_benefits": [
    {"title":"Discovery","area":"Benefits","duration_weeks":3,"start_offset_weeks":0},
    {"title":"Benefits Design","area":"Benefits","duration_weeks":5,"start_offset_weeks":3},
    {"title":"Build P1","area":"Benefits","duration_weeks":6,"start_offset_weeks":8},
    {"title":"Test","area":"Benefits","duration_weeks":4,"start_offset_weeks":14},
    {"title":"Cutover","area":"Benefits","duration_weeks":2,"start_offset_weeks":18},
  ],
}

@router.get("/templates")
def templates():
    return {"items": [{"key":k, "label":k.replace('_',' ').title(), "stages":v} for k,v in TEMPLATES.items()]}