export type RedactionPolicy = "strict" | "standard" | "off";

export interface RedactionResult {
  clean: string;
  tags: string[];
}

interface Detector {
  type: string;
  factory: () => RegExp;
  highConfidence: boolean;
}

const DETECTORS: Detector[] = [
  {
    type: "EMAIL",
    factory: () => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    highConfidence: true,
  },
  {
    type: "SSN",
    factory: () => /\b\d{3}-\d{2}-\d{4}\b/g,
    highConfidence: true,
  },
  {
    type: "CREDIT_CARD",
    factory: () => /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
    highConfidence: true,
  },
  {
    type: "PHONE",
    factory: () => /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    highConfidence: false,
  },
];

const COMMON_NAMES = [
  "john",
  "jane",
  "michael",
  "sarah",
  "david",
  "emily",
  "maria",
  "james",
];

function redactWithRegex(text: string, detector: Detector, shouldRedact: boolean, tags: Set<string>): string {
  if (!shouldRedact) return text;
  const pattern = detector.factory();
  return text.replace(pattern, () => {
    tags.add(detector.type);
    return `[REDACTED:${detector.type}]`;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function redactNames(text: string, policy: RedactionPolicy, tags: Set<string>): string {
  if (policy !== "strict") return text;
  if (!COMMON_NAMES.length) return text;
  const pattern = new RegExp(`\\b(${COMMON_NAMES.map(escapeRegExp).join("|")})\\b`, "gi");
  return text.replace(pattern, () => {
    tags.add("NAME");
    return "[REDACTED:NAME]";
  });
}

export function redact(text: string, policy: RedactionPolicy = "standard"): RedactionResult {
  if (policy === "off") {
    return { clean: text ?? "", tags: [] };
  }

  const tags = new Set<string>();
  let cleanText = text ?? "";

  for (const detector of DETECTORS) {
    const shouldRedact = policy === "strict" || detector.highConfidence;
    cleanText = redactWithRegex(cleanText, detector, shouldRedact, tags);
  }

  cleanText = redactNames(cleanText, policy, tags);

  return { clean: cleanText, tags: Array.from(tags) };
}
