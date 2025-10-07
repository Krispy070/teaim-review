#!/usr/bin/env node
import 'dotenv/config';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function section(title) {
  console.log(`\n→ ${title}`);
}

async function safe(action, label) {
  try {
    const result = await action();
    if (label) console.log(`   • ${label}`);
    return result;
  } catch (err) {
    const msg = err?.message || err?.toString() || 'unknown error';
    console.warn(`   ⚠️  ${label || 'operation'} skipped: ${msg}`);
    return null;
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required for seeding.');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const tableCache = new Map();
const columnCache = new Map();

async function tableExists(table) {
  if (tableCache.has(table)) return tableCache.get(table);
  const rows = await sql`select 1 from information_schema.tables where table_schema='public' and table_name=${table}`;
  const exists = rows.length > 0;
  tableCache.set(table, exists);
  return exists;
}

async function columnsFor(table) {
  if (columnCache.has(table)) return columnCache.get(table);
  const exists = await tableExists(table);
  if (!exists) {
    columnCache.set(table, []);
    return [];
  }
  const rows = await sql`select column_name from information_schema.columns where table_schema='public' and table_name=${table}`;
  const cols = rows.map((r) => r.column_name);
  columnCache.set(table, cols);
  return cols;
}

async function truncateTable(table) {
  if (!(await tableExists(table))) return;
  await sql.unsafe(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
}

async function insertRow(table, data, returningColumn) {
  const cols = await columnsFor(table);
  if (!cols.length) return null;
  const entries = Object.entries(data).filter(([key, value]) => value !== undefined && value !== null && cols.includes(key));
  if (!entries.length) return null;
  const colNames = entries.map(([key]) => `"${key}"`).join(', ');
  const placeholders = entries.map((_, idx) => `$${idx + 1}`).join(', ');
  const values = entries.map(([, value]) => value);
  const returning = returningColumn && cols.includes(returningColumn) ? ` RETURNING "${returningColumn}"` : '';
  const rows = await sql.unsafe(`INSERT INTO ${table} (${colNames}) VALUES (${placeholders})${returning}`, values);
  return returning ? rows?.[0]?.[returningColumn] ?? null : null;
}

async function seedFiles() {
  section('Preparing demo artifact files');
  const artifactsDir = path.join(repoRoot, 'demo-seed', 'artifacts');
  await fs.rm(artifactsDir, { recursive: true, force: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  const files = [
    {
      filename: 'hcm-kickoff-notes.txt',
      title: 'HCM Kickoff Notes',
      mime: 'text/plain',
      content: `Kickoff recap\n- Owners confirmed\n- Risks logged\n- Next actions captured for payroll & security.`,
    },
    {
      filename: 'payroll-parallel-plan.txt',
      title: 'Payroll Parallel Plan',
      mime: 'text/plain',
      content: `Parallel testing plan\nWeek 1: Load baseline\nWeek 2: Validate calculations\nWeek 3: Sign-off.`,
    },
  ];

  const artifactRecords = [];
  for (const file of files) {
    const filePath = path.join(artifactsDir, file.filename);
    await fs.writeFile(filePath, file.content, 'utf8');
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    artifactRecords.push({ ...file, path: relativePath });
    console.log(`   • wrote ${file.filename}`);
  }
  return artifactRecords;
}

async function clearTables() {
  section('Clearing existing seed data');
  const tables = [
    'conversation_messages',
    'conversations',
    'chat_connectors',
    'tests_history',
    'tests_library',
    'staging_tests',
    'onboarding_push_log',
    'onboarding_metrics',
    'onboarding_reflections',
    'onboarding_tasks',
    'onboarding_instances',
    'onboarding_steps',
    'project_tech_profile',
    'plan_tasks',
    'project_plans',
    'notifications',
    'actions',
    'summaries',
    'artifact_chunks',
    'artifacts',
    'mem_chunks',
    'mem_entries',
    'mem_stats',
    'workbook_runs',
    'reports',
    'workbooks',
    'areas',
    'integration_tests',
    'integrations',
    'tenants',
    'project_contacts',
    'project_members',
    'org_members',
    'profiles',
    'projects',
    'orgs',
  ];
  for (const table of tables) {
    await safe(() => truncateTable(table), `truncate ${table}`);
  }
}

async function seedBase(orgArtifacts) {
  section('Seeding organizations, users, and projects');
  const orgId = randomUUID();
  await insertRow('orgs', { id: orgId, name: 'TEAIM Demo Org', slug: 'teaim-demo' });

  const users = [
    { id: randomUUID(), email: 'owner@demo.teaim.app', full_name: 'Olivia Owner' },
    { id: randomUUID(), email: 'admin@demo.teaim.app', full_name: 'Alex Admin' },
    { id: randomUUID(), email: 'pm@demo.teaim.app', full_name: 'Priya PM' },
    { id: randomUUID(), email: 'lead@demo.teaim.app', full_name: 'Leo Lead' },
    { id: randomUUID(), email: 'member@demo.teaim.app', full_name: 'Mia Member' },
  ];

  for (const user of users) {
    await insertRow('profiles', {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: `https://avatars.dicebear.com/api/initials/${encodeURIComponent(user.full_name)}.svg`,
    });
    await insertRow('org_members', {
      org_id: orgId,
      user_id: user.id,
      role: user.email.startsWith('owner') ? 'owner' : user.email.startsWith('admin') ? 'admin' : user.email.startsWith('pm') ? 'pm' : 'member',
    });
  }

  const projects = [
    {
      id: randomUUID(),
      org_id: orgId,
      code: 'WD-ACME-2024',
      name: 'ACME Workday Launch',
      client_name: 'ACME Corp',
      status: 'test',
      lifecycle_status: 'active',
      start_date: new Date().toISOString(),
      ingest_alias_slug: 'acme-hcm',
      ingest_alias_token: 'demo-acme-token',
    },
    {
      id: randomUUID(),
      org_id: orgId,
      code: 'WD-GLOBEX-2025',
      name: 'Globex Payroll Rollout',
      client_name: 'Globex',
      status: 'design',
      lifecycle_status: 'active',
      start_date: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      ingest_alias_slug: 'globex-payroll',
      ingest_alias_token: 'demo-globex-token',
    },
  ];

  for (const project of projects) {
    await insertRow('projects', project);
    for (const user of users) {
      const role = user.email.startsWith('owner') ? 'owner' : user.email.startsWith('admin') ? 'admin' : user.email.startsWith('pm') ? 'pm' : user.email.startsWith('lead') ? 'lead' : 'member';
      await insertRow('project_members', {
        org_id: orgId,
        project_id: project.id,
        user_id: user.id,
        role,
        can_sign: role === 'owner' || role === 'admin',
      });
    }
  }

  return { orgId, users, projects, artifacts: orgArtifacts };
}

async function seedDashboard(base) {
  section('Seeding dashboard data (artifacts, summaries, actions, memory)');
  const [primaryProject] = base.projects;
  const now = new Date();

  const artifactIds = [];
  for (const artifact of base.artifacts) {
    const id = randomUUID();
    await insertRow('artifacts', {
      id,
      org_id: base.orgId,
      project_id: primaryProject.id,
      title: artifact.title,
      path: artifact.path,
      mime_type: artifact.mime,
      source: 'demo-seed',
      meeting_date: new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      chunk_count: 3,
      area: 'HCM',
    });
    artifactIds.push({ id, title: artifact.title });
  }

  for (const artifact of artifactIds) {
    await insertRow('summaries', {
      id: randomUUID(),
      org_id: base.orgId,
      project_id: primaryProject.id,
      artifact_id: artifact.id,
      summary: `${artifact.title} summary with key highlights and owner follow ups.`,
      risks: [{ title: 'Timeline risk', owner: 'Priya PM', mitigation: 'Weekly standups' }],
      decisions: [{ title: 'Adopt Workday Absence', owner: 'Olivia Owner' }],
      actions: [{ title: 'Confirm integrations scope', owner: 'Leo Lead', dueAt: now.toISOString() }],
      provenance: { seeded: true },
    });
  }

  const dashboardActions = [
    {
      title: 'Confirm security roles in Workday',
      description: 'Align on security roles for HR and Finance teams.',
      owner: 'Alex Admin',
      dueOffset: 3,
      status: 'pending',
      area: 'HCM',
    },
    {
      title: 'Publish payroll parallel calendar',
      description: 'Share the two-pass payroll testing calendar with client.',
      owner: 'Priya PM',
      dueOffset: 7,
      status: 'in_progress',
      area: 'Payroll',
    },
    {
      title: 'Collect sign-offs for integrations',
      description: 'Gather approvals from downstream system owners.',
      owner: 'Olivia Owner',
      dueOffset: 14,
      status: 'pending',
      area: 'Integrations',
    },
  ];

  for (const action of dashboardActions) {
    await insertRow('actions', {
      id: randomUUID(),
      org_id: base.orgId,
      project_id: primaryProject.id,
      title: action.title,
      description: action.description,
      owner: action.owner,
      verb: 'follow_up',
      due_date: new Date(now.getTime() + action.dueOffset * 24 * 3600 * 1000).toISOString(),
      status: action.status,
      area: action.area,
      extracted_from: 'demo seed',
    });
  }

  await insertRow('mem_stats', {
    id: randomUUID(),
    org_id: base.orgId,
    project_id: primaryProject.id,
    week_label: '2024-W45',
    very_negative: 1,
    negative: 2,
    neutral: 5,
    positive: 8,
    very_positive: 3,
    total_responses: 19,
    avg_score: 4,
  });

  await insertRow('mem_entries', {
    id: randomUUID(),
    org_id: base.orgId,
    project_id: primaryProject.id,
    type: 'semantic',
    content: {
      headline: 'Payroll configuration sprint complete',
      highlights: ['Parallel test window confirmed', 'Finance integration sequencing updated'],
    },
  });
}

async function seedOnboarding(base) {
  section('Seeding onboarding workflow');
  const [primaryProject] = base.projects;
  const stepTemplates = [
    { key: 'metrics', title: 'Metrics for Success', description: 'Define launch KPIs', order: 0 },
    { key: 'mindset', title: 'Team Mindset & Ownership', description: 'Clarify ownership model', order: 1 },
    { key: 'tech', title: 'Technology & Platforms', description: 'Document Workday tenants and tools', order: 2 },
    { key: 'integrations', title: 'Integrations Planning', description: 'Map Workday inbound/outbound flows', order: 3 },
    { key: 'training', title: 'Training & Enablement', description: 'Prepare training approach', order: 4 },
    { key: 'testing', title: 'Testing Strategy', description: 'Outline testing cadence', order: 5 },
    { key: 'data_reports', title: 'Data & Reporting', description: 'Confirm reporting deliverables', order: 6 },
    { key: 'financials', title: 'Financials & Budget', description: 'Review spend and forecast', order: 7 },
    { key: 'ocm', title: 'OCM & Communications', description: 'Plan comms cadence', order: 8 },
    { key: 'logistics', title: 'Logistics & Cadences', description: 'Standup ceremonies', order: 9 },
  ];

  const steps = new Map();
  for (const template of stepTemplates) {
    const id = randomUUID();
    await insertRow('onboarding_steps', {
      id,
      project_id: primaryProject.id,
      key: template.key,
      title: template.title,
      description: template.description,
      status: template.order < 2 ? 'done' : 'active',
      order_index: template.order,
    });
    steps.set(template.key, id);
  }

  const taskSeeds = [
    {
      step: 'metrics',
      title: 'Review go-live OKRs',
      owner: 'Priya PM',
      status: 'done',
      notes: 'Aligned in kickoff workshop',
      dueOffset: -2,
    },
    {
      step: 'mindset',
      title: 'Confirm RACI for stabilization',
      owner: 'Olivia Owner',
      status: 'in_progress',
      notes: 'Draft shared with execs',
      dueOffset: 5,
    },
    {
      step: 'tech',
      title: 'Inventory Workday tenants',
      owner: 'Alex Admin',
      status: 'planned',
      notes: 'Need sandbox details',
      dueOffset: 7,
    },
  ];

  for (const task of taskSeeds) {
    const stepId = steps.get(task.step);
    if (!stepId) continue;
    await insertRow('onboarding_tasks', {
      id: randomUUID(),
      project_id: primaryProject.id,
      step_id: stepId,
      title: task.title,
      owner: task.owner,
      status: task.status,
      notes: task.notes,
      due_at: new Date(Date.now() + task.dueOffset * 24 * 3600 * 1000).toISOString(),
    });
  }

  await insertRow('onboarding_metrics', {
    id: randomUUID(),
    project_id: primaryProject.id,
    name: 'Parallel payroll complete',
    owner: 'Priya PM',
    target: '2024-12-15',
    current: 'On Track',
    due_at: new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString(),
    status: 'on_track',
  });

  await insertRow('onboarding_reflections', {
    id: randomUUID(),
    project_id: primaryProject.id,
    prompt_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    author: 'Leo Lead',
    content: 'Team energized after showing first Workday prototype.',
  });

  await insertRow('project_tech_profile', {
    project_id: primaryProject.id,
    productivity: 'Jira + Confluence',
    chat: 'Slack #wd-launch',
    issues: 'Zendesk, severity triage in place',
    storage: 'Google Drive (shared)',
    notes: 'All integrations tracked in TEAIM',
    updated_at: new Date().toISOString(),
  });

  await insertRow('onboarding_instances', {
    id: randomUUID(),
    org_id: base.orgId,
    project_id: primaryProject.id,
    step_key: 'metrics',
    status: 'approved',
    due_date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    response_json: { notes: 'KPIs signed off' },
  });

  const planId = randomUUID();
  await insertRow('project_plans', {
    id: planId,
    project_id: primaryProject.id,
    title: 'Launch Plan v1',
    is_active: true,
  });

  await insertRow('plan_tasks', {
    id: randomUUID(),
    project_id: primaryProject.id,
    plan_id: planId,
    title: 'Prepare payroll blackout comms',
    owner: 'Mia Member',
    status: 'planned',
    priority: 50,
    order_index: 0,
    source: 'seed',
  });

  const stepId = steps.get('mindset');
  if (stepId) {
    await insertRow('onboarding_push_log', {
      id: randomUUID(),
      project_id: primaryProject.id,
      step_id: stepId,
      plan_id: planId,
      pushed_count: 2,
    });
  }
}

async function seedAdmin(base) {
  section('Seeding admin data (tenants, integrations, contacts)');
  const [primaryProject] = base.projects;
  const tenantId = randomUUID();
  await insertRow('tenants', {
    id: tenantId,
    project_id: primaryProject.id,
    name: 'ACME-WD2-IMPL',
    vendor: 'Workday',
    environment: 'prod',
    base_url: 'https://wd2-impl-services.workday.com',
    workday_short: 'wd2-acme',
    notes: 'Primary production tenant for ACME.',
  });

  await insertRow('project_contacts', {
    id: randomUUID(),
    project_id: primaryProject.id,
    org_id: base.orgId,
    name: 'Jamie Client Exec',
    email: 'jamie.client@acme.com',
    role: 'Executive Sponsor',
  });

  const integrationId = randomUUID();
  await insertRow('integrations', {
    id: integrationId,
    project_id: primaryProject.id,
    name: 'Payroll to ADP',
    source_system: 'Workday',
    target_system: 'ADP',
    status: 'in_progress',
    depends_on: ['Security roles', 'Parallel testing'],
    last_test_result: { status: 'pass', executedAt: new Date().toISOString() },
    owner: 'Leo Lead',
    environment: 'test',
    test_status: 'green',
    runbook_url: 'https://demo.teaim.app/runbooks/payroll-adp',
    notes: 'Validated with finance team.',
  });

  await insertRow('integration_tests', {
    id: randomUUID(),
    project_id: primaryProject.id,
    integration_id: integrationId,
    environment: 'test',
    status: 'passed',
    executed_at: new Date(Date.now() - 86400000).toISOString(),
    notes: 'End-to-end payroll file delivered to ADP test environment.',
  });
}

async function seedTests(base) {
  section('Seeding tests library data');
  const [primaryProject] = base.projects;
  const owner = base.users.find((u) => u.email.startsWith('pm'));

  const testId = await insertRow('tests_library', {
    id: randomUUID(),
    org_id: base.orgId,
    project_id: primaryProject.id,
    area_key: 'HCM',
    bp_code: 'HCM-Leave-001',
    title: 'Employee submits leave request',
    version: 1,
    gherkin: 'Given an employee with PTO balance when they submit a leave request then the manager receives an approval task',
    steps: [
      'Login as employee',
      'Navigate to Time Off worklet',
      'Submit leave request for future date',
      'Verify manager receives inbox item',
    ],
    priority: 'P1',
    type: 'happy',
    tags: ['leave', 'hcm'],
    created_by: owner?.id,
  }, 'id');

  if (testId) {
    await insertRow('tests_history', {
      id: randomUUID(),
      org_id: base.orgId,
      project_id: primaryProject.id,
      test_id: testId,
      version: 1,
      diff: { from: null, to: 'Initial import from conversation seed' },
      reason: 'transcript_correction',
      committed_by: owner?.id,
    });
  }

  await insertRow('staging_tests', {
    id: randomUUID(),
    org_id: base.orgId,
    project_id: primaryProject.id,
    dedupe_key: 'chat-123',
    title: 'Payroll retro pay calculation',
    gherkin: 'Given retro payroll when payroll is recalculated then differences are highlighted',
    steps: ['Load retro pay', 'Run calculation', 'Validate adjustments'],
    area_key: 'Payroll',
    bp_code: 'PAY-Calc-009',
    priority: 'P2',
    type: 'edge',
    tags: ['payroll', 'retro'],
    trace: ['Conversation #456 excerpt'],
    confidence: 0.82,
  });
}

async function seedChat(base) {
  section('Seeding chat & conversation data');
  const [primaryProject] = base.projects;
  await insertRow('chat_connectors', {
    id: randomUUID(),
    project_id: primaryProject.id,
    type: 'slack',
    label: 'Slack #wd-launch',
    team_id: 'T123',
    channel_id: 'C456',
    meta: { demo: true },
  });

  const conversationId = randomUUID();
  await insertRow('conversations', {
    id: conversationId,
    project_id: primaryProject.id,
    source: 'slack',
    source_ref: 'C456:169',
    title: 'Parallel payroll blockers',
    created_by: 'Priya PM',
    summary: 'Team discussed payroll blockers and captured next actions.',
    insights: { actions: 2, risks: 1 },
    summarized_at: new Date().toISOString(),
  });

  const messages = [
    {
      author: 'Priya PM',
      text: 'Need confirmation that finance is ready for retro testing.',
      atOffset: -30,
    },
    {
      author: 'Leo Lead',
      text: 'We can start after tonight\'s refresh. Will log action in TEAIM.',
      atOffset: -20,
    },
    {
      author: 'Mia Member',
      text: 'Drafting comms summary for tomorrow\'s standup.',
      atOffset: -5,
    },
  ];

  for (const msg of messages) {
    await insertRow('conversation_messages', {
      id: randomUUID(),
      project_id: primaryProject.id,
      conversation_id: conversationId,
      author: msg.author,
      text: msg.text,
      at: new Date(Date.now() + msg.atOffset * 60 * 1000).toISOString(),
      meta: {},
    });
  }
}

async function seedReports(base) {
  section('Seeding reports & workbook data');
  const [primaryProject] = base.projects;
  const areaId = randomUUID();
  await insertRow('areas', {
    id: areaId,
    project_id: primaryProject.id,
    key: 'PAYROLL',
    name: 'Payroll',
    status: 'active',
  });

  const workbookId = randomUUID();
  await insertRow('workbooks', {
    id: workbookId,
    org_id: base.orgId,
    project_id: primaryProject.id,
    area_id: areaId,
    title: 'Payroll Parallel Tracker',
    metrics: { totalTests: 12, passing: 9 },
    iterations_planned: 3,
    iterations_done: 1,
    status: 'in_progress',
    due_date: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
  });

  await insertRow('workbook_runs', {
    id: randomUUID(),
    org_id: base.orgId,
    project_id: primaryProject.id,
    workbook_id: workbookId,
    run_no: 1,
    status: 'pulled',
    rows: 250,
    pulled_on: new Date(Date.now() - 86400000).toISOString(),
  });

  await insertRow('reports', {
    id: randomUUID(),
    project_id: primaryProject.id,
    area_id: areaId,
    type: 'status',
    title: 'Payroll Readiness Snapshot',
    payload: {
      readiness: 72,
      blockers: ['Retro payroll data', 'Security provisioning'],
      highlights: ['Integration smoke tests passed'],
    },
  });
}

async function main() {
  console.log('🌱 Starting TEAIM demo seed...');
  try {
    const files = await seedFiles();
    await clearTables();
    const base = await seedBase(files);
    await seedDashboard(base);
    await seedOnboarding(base);
    await seedAdmin(base);
    await seedTests(base);
    await seedChat(base);
    await seedReports(base);
    console.log('\n✅ Demo seed complete. Ready to explore the app!');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
