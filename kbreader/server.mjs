import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_ROOT = path.resolve(process.env.KB_ROOT || path.join(os.homedir(), 'kb'));
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 8124);
const HOST = process.env.HOST || '0.0.0.0';

marked.setOptions({ gfm: true, breaks: false });

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeResolve(rel) {
  const clean = String(rel || '').replace(/^\/+/, '');
  const segments = clean.split('/').filter(Boolean);
  if (segments.includes('..')) return null;
  const full = path.resolve(KB_ROOT, ...segments);
  if (full !== KB_ROOT && !full.startsWith(KB_ROOT + path.sep)) return null;
  return { rel: segments.join('/'), full };
}

function isDir(full) { try { return fs.statSync(full).isDirectory(); } catch { return false; } }
function isFile(full) { try { return fs.statSync(full).isFile(); } catch { return false; } }

function listMdFiles(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      out.push(...listMdFiles(full, rel));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(rel);
    }
  }
  return out.sort();
}

function recentMdFiles(limit = 30) {
  const out = [];
  for (const rel of listMdFiles(KB_ROOT)) {
    const full = path.join(KB_ROOT, ...rel.split('/'));
    try {
      const st = fs.statSync(full);
      out.push({ rel, full, mtime: st.mtimeMs });
    } catch { /* skip */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.round(h / 24);
  if (d < 30) return d + 'd ago';
  return new Date(ts).toISOString().slice(0, 10);
}

function buildTree(files) {
  // nested object
  const root = {};
  for (const f of files) {
    const parts = f.split('/');
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      if (i === parts.length - 1) {
        cur[seg] = { __file: f };
      } else {
        cur[seg] = cur[seg] || {};
      }
      cur = cur[seg];
    }
  }
  return root;
}

function renderTree(node, currentRel = '') {
  const entries = Object.keys(node).sort((a, b) => {
    const aDir = node[a] && !node[a].__file;
    const bDir = node[b] && !node[b].__file;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.localeCompare(b);
  });
  if (entries.length === 0) return '';
  let html = '<ul>';
  for (const name of entries) {
    const v = node[name];
    if (v && v.__file) {
      const href = (BASE_PATH ? BASE_PATH + '/' : '/') + v.__file.split('/').map(encodeURIComponent).join('/');
      const active = v.__file === currentRel ? ' class="active" aria-current="page"' : '';
      html += `<li><a${active} href="${href}">${escapeHtml(name.replace(/\.md$/i, ''))}</a></li>`;
    } else {
      html += `<li><span class="dir">${escapeHtml(name)}</span>${renderTree(v, currentRel)}</li>`;
    }
  }
  html += '</ul>';
  return html;
}

function rewriteOne(target, currentRelDir) {
  if (/^(https?:|mailto:|data:)/.test(target)) return target;
  if (target.startsWith('#')) return target;
  let anchor = '';
  let t = target;
  const hashIdx = t.indexOf('#');
  if (hashIdx !== -1) { anchor = t.slice(hashIdx); t = t.slice(0, hashIdx); }
  if (t === '') return target;
  const base = currentRelDir ? currentRelDir + '/' : '';
  let resolved = path.posix.normalize(base + t).replace(/^\/+/, '');
  if (resolved === '' || resolved.includes('..')) return target;
  // If target has no extension and a .md exists, try adding .md? Keep as-is; kb uses explicit .md.
  const encoded = resolved.split('/').map(encodeURIComponent).join('/');
  const href = (BASE_PATH ? BASE_PATH + '/' : '/') + encoded;
  return href + anchor;
}

function rewriteMarkdownLinks(md, currentRelDir) {
  return md.replace(/(!?\[[^\]]*\])\(([^)]+)\)/g, (m, bracket, target) => {
    const titleMatch = target.match(/^(\S+)(\s+"[^"]*")?$/);
    if (!titleMatch) return m;
    const url = titleMatch[1];
    const title = titleMatch[2] || '';
    const newUrl = rewriteOne(url, currentRelDir);
    return `${bracket}(${newUrl}${title})`;
  });
}

function renderFrontmatter(data) {
  if (!data || Object.keys(data).length === 0) return '';
  const rows = [];
  const order = ['type', 'title', 'description', 'status', 'updated', 'stale_after', 'tags'];
  const shown = new Set();
  for (const k of order) {
    if (data[k] !== undefined) { rows.push([k, data[k]]); shown.add(k); }
  }
  for (const k of Object.keys(data)) {
    if (shown.has(k)) continue;
    rows.push([k, data[k]]);
  }
  let html = '<div class="meta">';
  for (const [k, v] of rows) {
    let val;
    if (Array.isArray(v)) val = v.map(x => typeof x === 'object' && x !== null ? escapeHtml(JSON.stringify(x)) : escapeHtml(x)).join(', ');
    else if (typeof v === 'object' && v !== null) val = escapeHtml(JSON.stringify(v));
    else val = escapeHtml(v);
    html += `<div class="meta-row"><span class="meta-key">${escapeHtml(k)}</span><span class="meta-val">${val}</span></div>`;
  }
  html += '</div>';
  return html;
}

function renderPage({ title, bodyHtml, metaHtml, currentRel, treeHtml }) {
  const homeHref = BASE_PATH ? BASE_PATH : '/';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#ff7aa2">
<title>${escapeHtml(title)} — KB Reader</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
@font-face { font-family:'Kinto Sans'; src:url('https://cdn.jsdelivr.net/gh/ookamiinc/kinto@master/Kinto%20Sans/KintoSans-Regular.woff2') format('woff2'); font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:'Kinto Sans'; src:url('https://cdn.jsdelivr.net/gh/ookamiinc/kinto@master/Kinto%20Sans/KintoSans-Medium.woff2') format('woff2'); font-weight:500; font-style:normal; font-display:swap; }
@font-face { font-family:'Kinto Sans'; src:url('https://cdn.jsdelivr.net/gh/ookamiinc/kinto@master/Kinto%20Sans/KintoSans-Bold.woff2') format('woff2'); font-weight:700; font-style:normal; font-display:swap; }
:root { color-scheme:dark; --bg:#070a14; --bg-2:#0f1526; --panel:rgba(18,26,46,.62); --panel-2:rgba(28,38,64,.78); --ink:#f0eef8; --muted:#9aa0b8; --sakura:#ff7aa2; --sakura-2:#ffc2d6; --violet:#8b7cff; --glow:rgba(255,122,162,.4); --border:rgba(255,122,162,.18); --grid:rgba(255,255,255,.03); }
* { box-sizing:border-box; }
html { scroll-behavior:smooth; }
body { margin:0; min-height:100vh; background:radial-gradient(1400px 900px at 90% -20%, rgba(255,122,162,.22), transparent 55%), radial-gradient(1000px 800px at -10% 10%, rgba(139,124,255,.2), transparent 60%), linear-gradient(180deg, var(--bg), var(--bg-2)); color:var(--ink); font-family:'Kinto Sans','Inter',system-ui,sans-serif; font-size:16px; -webkit-font-smoothing:antialiased; line-height:1.7; overflow-x:hidden; }
body::before { content:''; position:fixed; inset:0; pointer-events:none; background:radial-gradient(circle at 20% 30%, rgba(255,122,162,.06), transparent 40%), radial-gradient(circle at 80% 70%, rgba(139,124,255,.05), transparent 45%); z-index:0; }
a { color:var(--sakura-2); text-decoration:none; transition:color .2s, text-shadow .2s; }
a:hover { color:#fff; text-shadow:0 0 14px var(--glow); }
.layout { position:relative; z-index:1; min-height:100vh; display:grid; grid-template-columns:1fr 260px; gap:0; }
.sidebar { order:2; position:sticky; top:0; height:100vh; overflow:auto; padding:24px 18px; background:rgba(10,14,26,.55); backdrop-filter:blur(14px); border-left:1px solid var(--border); }
.sidebar::-webkit-scrollbar { width:6px; }
.sidebar::-webkit-scrollbar-thumb { background:rgba(255,122,162,.25); border-radius:3px; }
.brand { display:flex; align-items:center; gap:10px; text-decoration:none; margin-bottom:20px; }
.brand-mark { display:grid; place-items:center; width:34px; height:34px; background:linear-gradient(135deg,var(--sakura),var(--violet)); border-radius:10px; box-shadow:0 0 20px var(--glow); color:#fff; font:700 18px 'Kinto Sans',sans-serif; transition:transform .3s; }
.brand:hover .brand-mark { transform:rotate(-8deg) scale(1.05); }
.brand-name { display:block; font:700 16px 'Kinto Sans',sans-serif; letter-spacing:-.02em; color:var(--sakura-2); }
.brand-caption { display:block; font-size:10px; color:var(--muted); margin-top:2px; }
.search-wrap { margin:14px 0 18px; }
.search-input { width:100%; padding:9px 14px; border:1px solid var(--border); border-radius:999px; outline:none; background:rgba(255,255,255,.05); color:var(--ink); font:10px 'DM Mono',monospace; transition:all .2s; }
.search-input:focus { box-shadow:0 0 0 3px var(--glow); border-color:var(--sakura); background:rgba(255,255,255,.08); }
.search-input::placeholder { color:#6b6f82; }
.nav { margin-top:6px; }
.nav ul { list-style:none; padding-left:12px; margin:4px 0; border-left:1px solid var(--border); }
.nav li { margin:2px 0; }
.nav li > a { display:block; padding:7px 10px; font-size:12px; text-decoration:none; border-radius:8px; transition:all .18s; }
.nav li > a:hover,.nav li > a.active { background:rgba(255,122,162,.12); color:var(--sakura-2); transform:translateX(2px); }
.nav .dir { display:block; padding:7px 9px 3px; color:var(--muted); font-size:9px; text-transform:uppercase; letter-spacing:.12em; }
.nav li[hidden] { display:none; }
.main { min-height:100vh; padding:0 clamp(20px,4vw,60px) 80px; animation:fadeIn .7s ease-out; }
.topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 0 10px; }
.topbar .title { font:700 13px 'Kinto Sans',sans-serif; color:var(--sakura-2); letter-spacing:.04em; text-transform:uppercase; }
.topbar .actions { display:flex; gap:8px; }
.topbar .chip { padding:6px 12px; border:1px solid var(--border); border-radius:999px; background:rgba(255,255,255,.04); font-size:9px; text-transform:uppercase; letter-spacing:.1em; transition:all .2s; }
.topbar .chip:hover { background:rgba(255,122,162,.12); box-shadow:0 0 16px var(--glow); }
.hero { margin:10px 0 30px; padding:clamp(32px,5vw,56px); border:1px solid var(--border); border-radius:20px; background:linear-gradient(135deg, rgba(255,122,162,.14), rgba(139,124,255,.1)); box-shadow:0 0 40px rgba(255,122,162,.08); animation:slideUp .7s ease-out; }
.hero-kicker { font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--sakura-2); margin-bottom:12px; }
.hero h1 { margin:0; font:700 clamp(40px,7vw,88px)/.9 'Kinto Sans',sans-serif; letter-spacing:-.05em; color:#fff; text-shadow:0 0 32px var(--glow); }
.hero p { margin:14px 0 0; color:var(--muted); max-width:640px; font-size:13px; }
.meta { display:flex; flex-wrap:wrap; gap:8px; margin:20px 0 24px; }
.meta-row { display:flex; align-items:center; gap:8px; padding:7px 12px; border:1px solid var(--border); border-radius:999px; background:rgba(255,255,255,.03); font-size:9px; transition:all .2s; }
.meta-row:hover { background:rgba(255,122,162,.1); box-shadow:0 0 14px var(--glow); }
.meta-key { color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
.meta-key::after { content:':'; }
.meta-val { font-weight:500; color:var(--ink); }
article { max-width:920px; padding:clamp(22px,4vw,44px); border:1px solid var(--border); border-radius:18px; background:var(--panel); box-shadow:0 16px 48px rgba(0,0,0,.4); font-size:15px; line-height:1.8; backdrop-filter:blur(8px); animation:fadeInUp .6s ease-out .1s both; }
article h1,article h2,article h3,article h4 { font-family:'Kinto Sans',sans-serif; font-weight:700; line-height:1.1; letter-spacing:-.04em; color:var(--sakura-2); }
article h1 { margin:2.2rem 0 .8rem; font-size:clamp(34px,5vw,64px); }
article h2 { margin:2.2rem 0 .8rem; padding-bottom:.6rem; border-bottom:1px solid var(--border); font-size:clamp(25px,3vw,38px); }
article h3 { margin:1.8rem 0 .6rem; font-size:22px; }
article p { margin:1rem 0; color:var(--ink); }
article ul,article ol { padding-left:1.5rem; margin:.9rem 0; }
article li { margin:.35rem 0; padding-left:.2rem; }
article li::marker { color:var(--sakura); }
article code { padding:.15rem .32rem; border:1px solid var(--border); border-radius:6px; background:rgba(255,122,162,.1); font-size:.9em; color:var(--sakura-2); }
article pre { margin:1.2rem 0; padding:17px; overflow:auto; border:1px solid var(--border); border-radius:12px; background:rgba(14,20,36,.9); box-shadow:0 0 24px rgba(0,0,0,.35); font-size:11px; line-height:1.6; }
article pre code { padding:0; border:0; background:none; }
article blockquote { margin:1.4rem 0; padding:10px 16px; border-left:3px solid var(--sakura); border-radius:8px; background:rgba(255,122,162,.08); }
article a { color:var(--sakura-2); text-decoration:underline; text-underline-offset:3px; transition:color .2s; }
article a:hover { color:#fff; }
article img { max-width:100%; height:auto; border:1px solid var(--border); border-radius:12px; }
article hr { margin:2rem 0; border:0; border-top:1px solid var(--border); }
article table { display:block; width:100%; overflow:auto; border-collapse:collapse; margin:1.3rem 0; font-size:10px; }
article th,article td { padding:9px 11px; border:1px solid var(--border); text-align:left; }
article th { background:rgba(255,122,162,.12); color:var(--sakura-2); }
.listing ul { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:13px; list-style:none; padding:0; }
.listing li { min-height:92px; padding:17px; border:1px solid var(--border); border-radius:14px; background:var(--panel); box-shadow:0 8px 24px rgba(0,0,0,.3); font-size:11px; transition:transform .2s,box-shadow .2s; animation:fadeInUp .5s ease-out both; }
.listing li:hover { transform:translateY(-3px); box-shadow:0 0 28px var(--glow); }
.listing a { font-weight:500; color:var(--sakura-2); }
.recent-list { display:block; padding:0; grid-template-columns:none; }
.recent-list li { min-height:0; padding:11px 14px; display:flex; align-items:baseline; justify-content:space-between; gap:14px; background:rgba(255,255,255,.03); border:1px solid var(--border); border-radius:10px; margin-bottom:8px; transition:all .2s; }
.recent-list li:hover { background:rgba(255,122,162,.08); transform:translateX(2px); }
.recent-time { flex:none; color:var(--muted); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
.ticker { overflow:hidden; width:100%; margin:0 0 28px; padding:9px 0; border-block:1px solid var(--border); background:rgba(255,122,162,.08); color:var(--sakura-2); white-space:nowrap; border-radius:10px; }
.ticker span { display:inline-block; padding-left:100%; animation:marquee 32s linear infinite; font-size:9px; letter-spacing:.12em; text-transform:uppercase; }
@keyframes marquee { to { transform:translateX(-100%); } }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeInUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
@keyframes slideInRight { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
@keyframes petalFloat { 0% { transform:translateY(-10vh) rotate(0deg); opacity:0; } 10% { opacity:.6; } 90% { opacity:.6; } 100% { transform:translateY(110vh) rotate(360deg); opacity:0; } }
.petals { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
.petals span { position:absolute; top:-10vh; font-size:14px; color:rgba(255,122,162,.35); animation:petalFloat 18s linear infinite; }
.petals span:nth-child(2) { left:20%; animation-delay:3s; animation-duration:22s; }
.petals span:nth-child(3) { left:40%; animation-delay:7s; animation-duration:19s; }
.petals span:nth-child(4) { left:60%; animation-delay:1s; animation-duration:24s; }
.petals span:nth-child(5) { left:80%; animation-delay:5s; animation-duration:20s; }
@media (max-width:900px) {
  .layout { grid-template-columns:1fr; }
  .sidebar { position:fixed; top:0; right:0; left:auto; width:min(300px,85vw); height:100vh; transform:translateX(100%); transition:transform .3s; z-index:20; border-left:1px solid var(--border); border-right:0; }
  .sidebar.open { transform:translateX(0); }
  .main { padding:0 16px 60px; }
  .browse-toggle { display:inline-flex; }
}
@media (min-width:901px) { .browse-toggle { display:none; } }
@media (max-width:760px) {
  .hero h1 { font-size:clamp(36px,12vw,64px); }
  article { padding:18px; }
  .meta-row { padding:7px 9px; }
}
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation-duration:.01ms!important; transition:none!important; } .petals { display:none; } }

</style>
</head>
<body>
<div class="petals" aria-hidden="true"><span>🌸</span><span>🌸</span><span>🌸</span><span>🌸</span><span>🌸</span></div>
<div class="layout">
  <aside class="sidebar" id="sidebar">
    <a class="brand" href="${homeHref}">
      <span class="brand-mark" aria-hidden="true">栞</span>
      <span><span class="brand-name">Shiori</span><span class="brand-caption">a bookmark for durable knowledge</span></span>
    </a>
    <div class="search-wrap">
      <input class="search-input" id="nav-search" type="search" placeholder="Search notes..." autocomplete="off" aria-label="Filter notes" />
    </div>
    <nav class="nav" id="notes-nav" aria-label="Notes">${treeHtml}</nav>
  </aside>
  <main class="main">
    <div class="topbar">
      <span class="title">Shiori</span>
      <div class="actions">
        <button class="chip browse-toggle" id="browse-toggle" type="button" aria-expanded="false" aria-controls="notes-nav">Browse</button>
        <a class="chip" href="${homeHref}">Home</a>
      </div>
    </div>
    <div class="crumb">${currentRel ? `<a href="${homeHref}">Shiori</a> &nbsp;/&nbsp; ${escapeHtml(currentRel)}` : 'Shiori'}</div>
    <div class="hero">
      <div class="hero-kicker">SHIORI / DURABLE KNOWLEDGE</div>
      <h1>${escapeHtml(title)}</h1>
      <p>A quiet place to think. Open only the pages a question needs.</p>
    </div>
    <div class="ticker" aria-hidden="true"><span>READ DEEPLY &nbsp; ✳ &nbsp; KEEP CONTEXT &nbsp; ✳ &nbsp; MAKE KNOWLEDGE USEFUL &nbsp; ✳ &nbsp;</span></div>
    <div class="meta">${metaHtml}</div>
    <article>${bodyHtml}</article>
  </main>
</div>
<script>
  const sidebar = document.querySelector('.sidebar');
  const browse = document.querySelector('#browse-toggle');
  browse?.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    browse.setAttribute('aria-expanded', String(open));
    browse.textContent = open ? 'Close' : 'Browse';
    if (open) document.querySelector('#nav-search')?.focus();
  });
  const search = document.querySelector('#nav-search');
  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('open')) return;
    if (sidebar.contains(e.target) || browse.contains(e.target)) return;
    sidebar.classList.remove('open');
    browse.setAttribute('aria-expanded', 'false');
    browse.textContent = 'Browse';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      browse.setAttribute('aria-expanded', 'false');
      browse.textContent = 'Browse';
    }
  });
  const links = [...document.querySelectorAll('nav a')];
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase();
    for (const link of links) {
      const item = link.closest('li');
      item.hidden = query !== '' && !link.textContent.toLocaleLowerCase().includes(query);
    }
    for (const folder of document.querySelectorAll('nav .dir')) {
      const item = folder.closest('li');
      const hasVisibleNote = [...item.querySelectorAll('a')].some(link => !link.closest('li').hidden);
      item.hidden = query !== '' && !folder.textContent.toLocaleLowerCase().includes(query) && !hasVisibleNote;
    }
  });
</script>
</body>
</html>`;
}

function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = '';
  try { pathname = decodeURIComponent(url.pathname); } catch { pathname = url.pathname; }

  // strip base path
  if (BASE_PATH && (pathname === BASE_PATH || pathname.startsWith(BASE_PATH + '/'))) {
    pathname = pathname.slice(BASE_PATH.length) || '/';
  }
  if (!pathname.startsWith('/')) pathname = '/' + pathname;

  // root
  let rel = pathname.replace(/^\/+/, '');
  if (rel === '') rel = 'index.md';

  const resolved = safeResolve(rel);
  if (!resolved) {
    res.statusCode = 400;
    res.end('Bad path');
    return;
  }

  const { rel: relPath, full } = resolved;

  // If directory, try index.md
  if (isDir(full)) {
    const idxFull = path.join(full, 'index.md');
    if (isFile(idxFull)) {
      // render index.md with currentRelDir = relPath
      return renderFile(res, relPath + '/index.md', path.relative(KB_ROOT, idxFull).split(path.sep).join('/'));
    }
    // listing
    const entries = fs.readdirSync(full, { withFileTypes: true });
    const items = entries.map(e => {
      const href = (BASE_PATH ? BASE_PATH + '/' : '/') + (relPath ? relPath + '/' : '') + encodeURIComponent(e.name);
      return `<li>${e.isDirectory() ? '📁' : '📄'} <a href="${href}">${escapeHtml(e.name)}</a></li>`;
    }).join('');
    const treeHtml = renderTree(buildTree(listMdFiles(KB_ROOT)));
    const html = renderPage({
      title: relPath || 'kb',
      bodyHtml: `<div class="listing"><ul>${items}</ul></div>`,
      metaHtml: '',
      currentRel: relPath,
      treeHtml
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
    return;
  }

  if (!isFile(full)) {
    // maybe user omitted .md
    const withMd = full + '.md';
    if (isFile(withMd)) {
      const newRel = (relPath.endsWith('.md') ? relPath : relPath + '.md');
      return renderFile(res, newRel, newRel);
    }
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  renderFile(res, relPath, relPath);
}

function renderFile(res, currentRel, fileRel) {
  const resolved = safeResolve(fileRel);
  if (!resolved || !isFile(resolved.full)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const raw = fs.readFileSync(resolved.full, 'utf-8');
  let data = {};
  let content = raw;
  try {
    const m = matter(raw);
    data = m.data || {};
    content = m.content;
  } catch (e) {
    // fallback: no frontmatter
  }

  const currentRelDir = path.posix.dirname(currentRel) === '.' ? '' : path.posix.dirname(currentRel);
  const rewritten = rewriteMarkdownLinks(content, currentRelDir);
  let bodyHtml = marked.parse(rewritten);

  // On the home page, append a "Recent" list of the 10 most recently modified files.
  if (currentRel === 'index.md') {
    const items = recentMdFiles(10)
      .filter(({ rel }) => rel !== 'index.md')
      .map(({ rel, mtime }) => {
        const href = (BASE_PATH ? BASE_PATH + '/' : '/') + rel.split('/').map(encodeURIComponent).join('/');
        const name = rel.split('/').pop().replace(/\.md$/i, '');
        return `<li><a href="${href}">${escapeHtml(name)}</a><span class="recent-time">${escapeHtml(relativeTime(mtime))}</span></li>`;
      }).join('');
    if (items) {
      bodyHtml += `<h2>Recent</h2><div class="listing"><ul class="recent-list">${items}</ul></div>`;
    }
  }

  const title = data.title || path.basename(currentRel, '.md');
  const metaHtml = renderFrontmatter(data);

  const treeHtml = renderTree(buildTree(listMdFiles(KB_ROOT)), currentRel);

  const html = renderPage({
    title,
    bodyHtml,
    metaHtml,
    currentRel,
    treeHtml
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(html);
}

const server = http.createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405; res.end('Method not allowed'); return;
    }
    handle(req, res);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('Internal error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`kbreader listening on ${HOST}:${PORT}, KB_ROOT=${KB_ROOT}, BASE_PATH=${BASE_PATH || '/'}`);
});
