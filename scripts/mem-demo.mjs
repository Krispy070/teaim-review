#!/usr/bin/env node
import 'dotenv/config';

const argProjectId = process.argv[2];
const projectId = argProjectId || process.env.DEMO_PROJECT_ID;

if (!projectId) {
  console.error('Usage: pnpm mem:demo <project-id> or set DEMO_PROJECT_ID before running.');
  process.exit(1);
}

const baseUrl = (process.env.DEMO_API_BASE_URL || process.env.API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const orgId = process.env.DEMO_ORG_ID;
const authToken = process.env.DEMO_API_TOKEN || process.env.API_TOKEN;

const sources = [
  {
    label: 'Release notes (csv_release)',
    sourceType: 'csv_release',
    items: [
      {
        release_name: 'Payroll Sprint 14',
        released_on: '2024-09-03',
        summary: 'Finalized gross-to-net validation and opened the parallel testing window.',
        highlights: [
          'Payroll parallel calendar approved by finance',
          'Retro adjustments automation deployed to preview tenant',
          'Cutover rehearsal placeholder scheduled for 9/18',
        ],
        follow_ups: [
          'Confirm garnishment mapping change control with compliance',
          'Send training deck update to change network leads',
        ],
      },
      {
        release_name: 'Integrations Sprint 7',
        released_on: '2024-09-10',
        summary: 'Moved Benefits API feed to production transport and hardened error alerts.',
        highlights: [
          'Outbound SFTP now retries automatically on partner downtime',
          'Finance downstream acknowledged new GL segment structure',
          'Security sign-off granted for PHI masking logic',
        ],
        follow_ups: [
          'Track first live payroll export on 9/24 for GL validation',
          'Schedule benefits vendor smoke test report back to PMO',
        ],
      },
      {
        release_name: 'Time Tracking Sprint 5',
        released_on: '2024-09-12',
        summary: 'Timesheet mobile UX fixes landed and overtime exception workflow is live.',
        highlights: [
          'Manager approvals now surface escalations within 24h',
          'Analytics widgets refreshed with new overtime KPI',
          'QA closed 18 defects; no blockers remain for pilot',
        ],
        follow_ups: [
          'Monitor pilot usage metrics starting 9/16',
          'Run targeted enablement session for store managers',
        ],
      },
    ],
  },
  {
    label: 'Meeting transcripts',
    sourceType: 'meeting_transcript',
    items: [
      {
        meeting_title: 'Cutover Readiness Standup',
        recorded_on: '2024-09-11',
        attendees: ['Olivia Owner', 'Jordan Integrations', 'Priya Payroll'],
        summary: 'Validated mock cutover timeline, flagged conversion file lag as the only high risk.',
        transcript: [
          { speaker: 'Olivia', text: 'We are on track for 9/30 cutover; need daily status on conversion file prep.' },
          { speaker: 'Jordan', text: 'Integrations smoke tested inbound benefit files, waiting on SFTP credentials rotation.' },
          { speaker: 'Priya', text: 'Payroll parallel run #2 finished with 1.6% variance after manual adjustments.' },
          { speaker: 'Olivia', text: 'Action: Jordan to own credential rotation, Priya to document variance root causes for steering.' },
        ],
      },
      {
        meeting_title: 'Testing Triage Huddle',
        recorded_on: '2024-09-09',
        attendees: ['Sam QA', 'Maya PM', 'Leo Security'],
        summary: 'Closed priority security defect, aligned on gate to move UAT sign-off forward.',
        transcript: [
          { speaker: 'Sam', text: 'TestRail shows 92% pass rate; only blocker was the SSO role leak, now patched.' },
          { speaker: 'Leo', text: 'Confirmed audit trail fix; ready to sign security gate once regression reruns tonight.' },
          { speaker: 'Maya', text: 'Need summary email for exec PMO: highlight readiness %, list open low-risk defects.' },
          { speaker: 'Sam', text: 'Action: Send nightly digest to PMO and prep sign-off deck for Wednesday walk-through.' },
        ],
      },
    ],
  },
  {
    label: 'Risk register excerpts',
    sourceType: 'doc',
    items: [
      {
        section: 'Parallel Testing Risks',
        updated_on: '2024-09-08',
        owner: 'Priya Payroll',
        content: 'Conversion file refresh ran 48 hours late last cycle; mitigation is to stage mock conversions two days earlier and secure backup DBA coverage.',
        impact: 'High',
        probability: 'Medium',
        next_actions: ['Lock backup DBA schedule', 'Share revised cadence with payroll SMEs'],
      },
      {
        section: 'Integrations & Reporting Risks',
        updated_on: '2024-09-12',
        owner: 'Jordan Integrations',
        content: 'Benefits carrier feed still on test credentials; go-live requires compliance sign-off on PHI masking plus 24h monitoring window after switch.',
        impact: 'Medium',
        probability: 'Medium',
        next_actions: ['Complete compliance review by 9/15', 'Enable enhanced alerts for first production cycle'],
      },
    ],
  },
];

async function ingestSource({ label, sourceType, items }) {
  const body = {
    project_id: projectId,
    policy: 'standard',
    source_type: sourceType,
    items,
  };
  if (orgId) body.org_id = orgId;

  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = authToken.startsWith('Bearer ')
    ? authToken
    : `Bearer ${authToken}`;

  const url = `${baseUrl}/api/memory/ingest`;
  process.stdout.write(`-> ${label} ... `);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }).catch((err) => ({ ok: false, status: 0, statusText: err.message }));

  if (!res?.ok) {
    console.error(`failed (${res?.status || 'network error'} ${res?.statusText || ''})`);
    const text = res && res.text ? await res.text().catch(() => '') : '';
    if (text) console.error(text);
    process.exit(1);
  }

  let json = {};
  try {
    json = await res.json();
  } catch (err) {
    // ignore JSON parse errors; fall back to item count
  }
  const inserted = Number(json.count ?? json.inserted ?? json.items?.length ?? json.memories?.length ?? items.length);
  console.log(`ok (${inserted} entries)`);
  return { label, count: inserted, sample: items[0] };
}

(async () => {
  console.log(`Seeding memory demo for project ${projectId}`);
  const summaries = [];
  for (const source of sources) {
    const summary = await ingestSource(source);
    summaries.push(summary);
  }

  const total = summaries.reduce((acc, cur) => acc + (cur.count || 0), 0);
  console.log('\nDemo ingest complete');
  summaries.forEach((s) => {
    console.log(`   • ${s.label}: ${s.count}`);
  });
  console.log(`   • Total memories added: ${total}`);

  console.log('\nTry these queries in Memory search:');
  [
    "What's the status of payroll parallel testing?",
    'List integration risks blocking go-live',
    'Summarize actions from the cutover readiness standup',
  ].forEach((q) => console.log(`   -> ${q}`));
})();
