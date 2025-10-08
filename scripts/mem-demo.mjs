// scripts/mem-demo.mjs
// Usage: pnpm mem:demo [projectId]
// Env: DEMO_PROJECT_ID, DEMO_API_BASE_URL (default http://127.0.0.1:3000), DEMO_API_TOKEN (optional)

import fetch from "node-fetch";

const projectArg = process.argv[2];
const PROJECT_ID =
  projectArg ||
  process.env.DEMO_PROJECT_ID ||
  (() => {
    console.error("❌ DEMO_PROJECT_ID not set and no CLI arg provided");
    process.exit(1);
  })();

const BASE_URL = process.env.DEMO_API_BASE_URL || "http://127.0.0.1:3000";
const AUTH = process.env.DEMO_API_TOKEN; // e.g., "Bearer <token>"

const headers = {
  "Content-Type": "application/json",
  ...(AUTH ? { Authorization: AUTH } : {}),
};

async function post(path, body) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${path} ${r.status}: ${t}`);
  }
  return r.json();
}

// Demo payloads (short, safe)
const releaseRows = [
  {
    title: "Release 24.2 – UAT wrap & cutover",
    description:
      "Cutover checklist finalized. Two UAT defects deferred to 24.2.1. Payroll parallel completed.",
    module: "UAT",
    date: "2025-08-10",
  },
  {
    title: "Release 24.2.1 – Patch",
    description:
      "Fixes for onboarding workflow timeout and position sync retry. No schema change.",
    module: "Patch",
    date: "2025-08-17",
  },
  {
    title: "Release 24.3 – Major",
    description:
      "Security roles rebaseline; retro calc improvements. Change management required.",
    module: "Major",
    date: "2025-09-01",
  },
];

const meetingTranscript = [
  { ts: "10:00", speaker: "PM", text: "Today we review UAT exit and open risks." },
  { ts: "10:05", speaker: "Payroll", text: "Parallel looks green; a few variances under 0.5%." },
  { ts: "10:10", speaker: "Testing", text: "Two blockers: approval latency and HR data fixes." },
  { ts: "10:20", speaker: "Change", text: "We’ll stage comms for role changes next Monday." },
];

const riskDocs = [
  `Risk Register – HCM Integrations
- Risk: Worker sync timing during cutover
- Mitigation: Freeze updates 24h prior; run backfill job post-cutover
- Owner: Integrations`,
  `Risk Register – Payroll Parallel
- Risk: Retro calculations inconsistent in edge cases
- Mitigation: Lock calc version; run validation script
- Owner: Payroll`,
];

async function main() {
  console.log(`Seeding memory demo for project: ${PROJECT_ID}`);
  let inserted = { csv_release: 0, meetings: 0, docs: 0 };

  // csv_release
  try {
    const out = await post("/api/memory/ingest", {
      project_id: PROJECT_ID,
      source_type: "csv_release",
      payload: { rows: releaseRows, file: "demo-release.csv" },
      policy: "standard",
    });
    inserted.csv_release = out?.inserted ?? out?.chunks ?? releaseRows.length;
    console.log("-> Release notes (csv_release): ok");
  } catch (e) {
    console.warn("csv_release seed warning:", e.message);
  }

  // meetings
  try {
    const out = await post("/api/memory/ingest", {
      project_id: PROJECT_ID,
      source_type: "meetings",
      payload: { transcript: meetingTranscript },
      policy: "standard",
    });
    inserted.meetings = out?.inserted ?? out?.chunks ?? meetingTranscript.length;
    console.log("-> Meeting transcripts: ok");
  } catch (e) {
    console.warn("meetings seed warning:", e.message);
  }

  // docs
  try {
    const out = await post("/api/memory/ingest", {
      project_id: PROJECT_ID,
      source_type: "docs",
      payload: { textBlocks: riskDocs },
      policy: "standard",
    });
    inserted.docs = out?.inserted ?? out?.chunks ?? riskDocs.length;
    console.log("-> Risk register excerpts (docs): ok");
  } catch (e) {
    console.warn("docs seed warning:", e.message);
  }

  console.log("\nDemo ingest complete");
  console.log(`• Release notes (csv_release): ${inserted.csv_release}`);
  console.log(`• Meeting transcripts:        ${inserted.meetings}`);
  console.log(`• Risk register excerpts:     ${inserted.docs}`);

  console.log("\nTry queries (POST /api/memory/retrieve):");
  console.log(`- "release blockers"`);
  console.log(`- "uat defects"`);
  console.log(`- "handoff risks"`);
}

main().catch((e) => {
  console.error("mem:demo failed:", e);
  process.exit(1);
});

