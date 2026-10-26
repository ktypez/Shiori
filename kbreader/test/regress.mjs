import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shiori-reader-'));
fs.mkdirSync(path.join(root, 'concepts'), { recursive: true });
fs.mkdirSync(path.join(root, 'entities'), { recursive: true });
fs.mkdirSync(path.join(root, 'sources'), { recursive: true });
fs.writeFileSync(path.join(root, 'index.md'), '---\ntitle: Fixture home\ntype: Index\n---\n# Fixture home\nWelcome.\n');
fs.writeFileSync(path.join(root, 'concepts', 'routing.md'), '---\ntitle: Routing\ntype: Concept\nstatus: stable\nstale_after: 2027-01-01\n---\n# Routing\nSee [cache](../entities/cache.md).\n');
fs.writeFileSync(path.join(root, 'entities', 'cache.md'), '---\ntitle: Cache\ntype: Entity\n---\n# Cache\n');
fs.writeFileSync(path.join(root, 'sources', 'source.md'), '# Source\n');

const port = 19000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'),
  env: { ...process.env, KB_ROOT: root, PORT: String(port), HOST: '127.0.0.1', BASE_PATH: '/kb' },
  stdio: 'ignore'
});
const base = `http://127.0.0.1:${port}/kb`;

try {
  let response;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { response = await fetch(`${base}/`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  assert.ok(response, 'server starts');
  assert.equal(response.status, 200, 'home status');
  const home = await response.text();
  assert.match(home, /Fixture home/, 'home content');
  assert.match(home, /class="meta-row"/, 'frontmatter displayed');
  assert.match(home, /<div class="stat-num">4<\/div>/, 'total markdown page count');
  assert.match(home, /1 concepts · 1 entities · 1 sources/, 'category counts');
  assert.match(home, /class="recent-list"/, 'recent pages displayed');
  assert.match(home, /href="\/kb\/concepts\/routing\.md"/, 'recent link uses base path');
  assert.match(home, /id="browse-toggle"/, 'mobile browse toggle exists');
  assert.match(home, /class="sidebar-shell/, 'sidebar exists');
  assert.match(home, /\.sidebar-shell\.open/, 'responsive drawer CSS exists');
  assert.match(home, /setDrawer\(true\)/, 'drawer toggle script exists');
  assert.match(home, /\.tree a:hover/, 'tree styles exist');
  assert.doesNotMatch(home, /Open a page to see recent changes/, 'recent placeholder removed');

  response = await fetch(`${base}/concepts/routing.md`);
  assert.equal(response.status, 200, 'nested page status');
  const nested = await response.text();
  assert.match(nested, /<title>Routing — KB Reader<\/title>/, 'nested page title');
  assert.match(nested, /<span class="meta-key">stale_after<\/span>/, 'nested metadata displayed');
  assert.match(nested, /href="\/kb\/entities\/cache\.md"/, 'relative markdown link rewritten');
  assert.match(nested, /aria-current="page"/, 'current tree page marked');

  console.log('Shiori KB reader regression checks passed');
} finally {
  server.kill('SIGTERM');
  fs.rmSync(root, { recursive: true, force: true });
}
