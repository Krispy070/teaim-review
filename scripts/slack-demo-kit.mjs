
#!/usr/bin/env node
import 'dotenv/config';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const MEM_SOURCE = 'slack-demo-kit';
const DEFAULT_QUERIES = ['handoff risks', 'uat defects', 'release blockers'];

function getBaseUrl() {
  const raw = process.env.APP_BASE_URL || '';
  if (!raw) return 'https://app.teaim.app';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function buildLinks(projectId) {
  const base = getBaseUrl();
  return [
    { title: 'Timeline overview', url: `${base}/projects/${projectId}/timeline` },
    { title: 'Risks insights', url: `${base}/projects/${projectId}/insights/risks` },
    { title: 'Decisions log', url: `${base}/projects/${projectId}/insights/decisions` },
  ];
}

function buildQueryLinks(projectId, queries = DEFAULT_QUERIES) {
  const base = getBaseUrl();
  return queries.map((q) => ({
    label: q,
    url: `${base}/projects/${projectId}/search?q=${encodeURIComponent(q)}`,
  }));
}

async function seedMemory(sql, projectId, orgId) {
  const now = new Date();
  const when = now.toISOString();

  await sql`
    delete from mem_entries
    where project_id = ${projectId} and content->>'source' = ${MEM_SOURCE}
  `;

  const entries = [
    {
      type: 'semantic',
      slug: 'handoff-risks',
      headline: 'Partner handoff risk review locked',
      summary: 'Risks workshop flagged the payroll handoff timeline; mitigation cadence starts Monday.',
      focus: ['handoff', 'risks', 'payroll'],
      callToAction: "Confirm downstream owners join Tuesday's standup.",
    },
    {
      type: 'episodic',
      slug: 'uat-defects',
      headline: 'UAT defect queue triage ready',
      summary: 'QA surfaced 14 open defects; 6 require Workday config and are now tagged with owners.',
      focus: ['uat', 'defects', 'testing'],
      callToAction: "Review Workday tenant notes before Thursday's sync.",
    },
    {
      type: 'decision',
      slug: 'release-blockers',
      headline: 'Release blocker path cleared',
      summary: 'Cutover council approved the revised blackout plan; downstream teams notified.',
      focus: ['release', 'blockers', 'cutover'],
      callToAction: 'Publish the updated runbook link in project updates.',
    },
  ];

  const inserted = [];
  for (const entry of entries) {
    const id = randomUUID();
    const payload = {
      ...entry,
      source: MEM_SOURCE,
      seededAt: when,
    };
    await sql`
      insert into mem_entries (id, org_id, project_id, type, content, created_at)
      values (${id}, ${orgId}, ${projectId}, ${entry.type}, ${sql.json(payload)}, ${when})
    `;
    inserted.push({ id, ...entry });
  }

  return inserted;
}

function slackBlocks({ project, links, queryLinks, insertedCount, actor }) {
  const heading = `:rocket: Demo kit ready for *${project.code}* (${project.name})`;
  const linkLines = links.map((link) => `• <${link.url}|${link.title}>`).join('\n');
  const queryLines = queryLinks.map((link) => `• <${link.url}|${link.label}>`).join('\n');
  const footer = actor ? `Requested by ${actor}` : 'Requested via demo kit';

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: heading },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Seeded *${insertedCount}* memory highlights.\n${linkLines}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Suggested queries*\n${queryLines}`,
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: footer }],
    },
  ];
}

async function postToSlack({ project, links, queryLinks, insertedCount, channel, actor }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!webhookUrl && !botToken) {
    return { posted: false, method: 'none' };
  }

  const blocks = slackBlocks({ project, links, queryLinks, insertedCount, actor });
  const text = `Demo kit ready for ${project.code} (${project.name})`;

  if (botToken && channel) {
    const resp = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, text, blocks }),
    });
    const json = await resp.json();
    if (!json.ok) {
      throw new Error(`Slack post failed: ${json.error || resp.status}`);
    }
    return { posted: true, method: 'bot' };
  }

  if (webhookUrl) {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Slack webhook failed: ${resp.status} ${body}`);
    }
    return { posted: true, method: 'webhook' };
  }

  return { posted: false, method: 'none' };
}

export async function runSlackDemoKit({ projectId, channel, actor, queries = DEFAULT_QUERIES, dryRun = false } = {}) {
  if (!projectId) throw new Error('projectId is required');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required to seed memories');

  const sql = postgres(dbUrl, { prepare: false });
  try {
    const rows = await sql`
      select p.id, p.code, p.name, p.org_id, o.name as org_name
      from projects p
      left join orgs o on o.id = p.org_id
      where p.id = ${projectId}
      limit 1
    `;
    const project = rows?.[0];
    if (!project) {
      throw new Error('Project not found');
    }

    const inserted = await seedMemory(sql, projectId, project.org_id);
    const links = buildLinks(projectId);
    const queryLinks = buildQueryLinks(projectId, queries);

    let postResult = { posted: false, method: 'none' };
    if (!dryRun) {
      postResult = await postToSlack({ project, links, queryLinks, insertedCount: inserted.length, channel, actor });
    }

    return {
      project,
      inserted,
      links,
      queryLinks,
      insertedCount: inserted.length,
      ...postResult,
      summary: `Seeded ${inserted.length} memories for ${project.code}`,
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith('--')) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args.project || args.projectId;
  const channel = args.channel;
  const actor = args.actor;
  const dryRun = args['dry-run'] === 'true' || args.dryRun === 'true';

  runSlackDemoKit({ projectId, channel, actor, dryRun })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
