import re
from typing import Dict, List, Tuple

PiiSummary = Dict[str, int]

class PiiPolicy:
    def __init__(self, mode: str = "strict", allow_email_domains: List[str] = None):
        self.mode = mode
        self.allow_email_domains = allow_email_domains or []

EMAIL = re.compile(r'\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b')
PHONE = re.compile(r'\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b')
SSN = re.compile(r'\b\d{3}-\d{2}-\d{4}\b')
DOB = re.compile(r'\b(?:19|20)\d{2}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b')
CC = re.compile(r'\b(?:\d[ -]*?){13,19}\b')
ROUTING = re.compile(r'\b\d{9}\b')
PASSPORT = re.compile(r'\b[A-PR-WY][1-9]\d\s?\d{4}[1-9]\b', re.IGNORECASE)
DL = re.compile(r'\b[A-Z0-9]{1,3}-?[A-Z0-9]{3,8}\b')
ADDRESS = re.compile(r'\b\d{1,5}\s+[A-Za-z][A-Za-z\s.-]{2,}\s+(?:Ave|Av|Ave\.|Rd|Rd\.|Road|St|St\.|Street|Blvd|Ln|Dr|Way|Ct|Hwy)\b', re.IGNORECASE)

def luhn_valid(s: str) -> bool:
    digits = re.sub(r'\D', '', s)
    if len(digits) < 13 or len(digits) > 19:
        return False
    total = 0
    dbl = False
    for i in range(len(digits) - 1, -1, -1):
        d = int(digits[i])
        if dbl:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        dbl = not dbl
    return total % 10 == 0

def mask(s: str, keep: int = 4) -> str:
    if len(s) <= keep:
        return "●" * len(s)
    return "●" * max(0, len(s) - keep) + s[-keep:]

def redact(text: str, policy: PiiPolicy) -> Tuple[str, PiiSummary, bool]:
    if not text or policy.mode == "none":
        return text, {}, False
    
    out = text
    summary: PiiSummary = {}
    
    def bump(k: str, n: int = 1):
        summary[k] = summary.get(k, 0) + n
    
    def redact_email(match):
        domain = match.group(1)
        allowed = any(domain.lower().endswith(d.lower()) for d in policy.allow_email_domains)
        if allowed:
            return match.group(0)
        bump("email")
        if policy.mode == "mask":
            return re.sub(r'^[^@]+', '***', match.group(0))
        return "[REDACTED:EMAIL]"
    
    out = EMAIL.sub(redact_email, out)
    
    out = SSN.sub(lambda m: (bump("ssn"), mask(m.group(0), 2) if policy.mode == "mask" else "[REDACTED:SSN]")[1], out)
    
    out = PHONE.sub(lambda m: (bump("phone"), mask(re.sub(r'\D', '', m.group(0)), 2) if policy.mode == "mask" else "[REDACTED:PHONE]")[1], out)
    
    out = DOB.sub(lambda m: (bump("dob"), "***-**-**" if policy.mode == "mask" else "[REDACTED:DOB]")[1], out)
    
    def redact_cc(match):
        if not luhn_valid(match.group(0)):
            return match.group(0)
        bump("card")
        if policy.mode == "mask":
            return mask(re.sub(r'[\s-]', '', match.group(0)))
        return "[REDACTED:CARD]"
    
    out = CC.sub(redact_cc, out)
    
    out = ROUTING.sub(lambda m: (bump("routing"), mask(m.group(0), 2) if policy.mode == "mask" else "[REDACTED:ROUTING]")[1], out)
    
    out = PASSPORT.sub(lambda m: (bump("passport"), mask(m.group(0), 2) if policy.mode == "mask" else "[REDACTED:PASSPORT]")[1], out)
    
    out = DL.sub(lambda m: (bump("driver_license"), mask(m.group(0), 2) if policy.mode == "mask" else "[REDACTED:DL]")[1], out)
    
    out = ADDRESS.sub(lambda m: (bump("address"), "[ADDR]" if policy.mode == "mask" else "[REDACTED:ADDRESS]")[1], out)
    
    had_pii = len(summary) > 0
    return out, summary, had_pii
