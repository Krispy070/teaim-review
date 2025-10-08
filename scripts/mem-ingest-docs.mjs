#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import process from 'process';

async function main() {
  const [projectId, filePath] = process.argv.slice(2);
  if (!projectId || !filePath) {
    console.error('Usage: pnpm mem:ingest:docs <project_id> <file_path>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  const content = await fs.readFile(resolvedPath, 'utf8');

  const baseUrl = process.env.MEMORY_API_BASE_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}/api/memory/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      source_type: 'docs',
      payload: {
        text: content,
        meta: { filename: path.basename(resolvedPath) },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('Ingest failed:', error.error || response.statusText);
    process.exit(1);
  }

  const result = await response.json();
  console.log('Ingest complete:', result);
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
