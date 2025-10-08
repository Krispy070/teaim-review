#!/usr/bin/env node
import 'dotenv/config';
import process from 'process';

const baseUrl = process.env.MEMORY_API_BASE_URL || 'http://localhost:3000';

async function ingest(projectId, source_type, payload) {
  const response = await fetch(`${baseUrl}/api/memory/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, source_type, payload }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to ingest ${source_type}`);
  }
  return response.json();
}

async function main() {
  const [projectId] = process.argv.slice(2);
  if (!projectId) {
    console.error('Usage: pnpm mem:demo <project_id>');
    process.exit(1);
  }

  console.log('Seeding documents...');
  const docResult = await ingest(projectId, 'docs', {
    text: `# TEAIM Project Brief\n\nOur Workday rollout focuses on:\n- Payroll parallel testing\n- Security matrix sign-off\n- Executive reporting cadence`,
    meta: { filename: 'project-brief.md' },
  });
  console.log('  → docs:', docResult);

  console.log('Seeding meeting transcript...');
  const meetingResult = await ingest(projectId, 'meetings', {
    transcript: [
      { ts: '00:00:05', speaker: 'Olivia', text: 'Welcome everyone, today we review payroll parallel readiness.' },
      { ts: '00:01:10', speaker: 'Mason', text: 'Security roles are mapped and provisioning finishes Friday.' },
      { ts: '00:02:45', speaker: 'Ava', text: 'Testing reveals a gap in absence accrual that we will patch tomorrow.' },
    ],
  });
  console.log('  → meetings:', meetingResult);
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
