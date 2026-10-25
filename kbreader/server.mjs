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
<meta name="theme-color" content="#1557f5">
<title>${escapeHtml(title)} — KB Reader</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
@font-face { font-family:'Kinto Sans'; src:url('https://cdn.jsdelivr.net/gh/ookamiinc/kinto@master/Kinto%20Sans/KintoSans-Regular.woff2') format('woff2'); font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:'Kinto Sans'; src:url('https://cdn.jsdelivr.net/gh/ookamiinc/kinto@master/Kinto%20Sans/KintoSans-Medium.woff2') format('woff2'); font-weight:500; font-style:normal; font-display:swap; }
@font-face { font-family:'Kinto Sans'; src:url('https://cdn.jsdelivr.net/gh/ookamiinc/kinto@master/Kinto%20Sans/KintoSans-Bold.woff2') format('woff2'); font-weight:700; font-style:normal; font-display:swap; }
  :root { color-scheme:dark; --bg:#0a0e1a; --bg-2:#12182b; --panel:rgba(20,28,48,.72); --panel-2:rgba(28,38,64,.85); --ink:#e8e6f2; --muted:#9aa0b4; --sakura:#ff7aa2; --sakura-2:#ffb3cc; --violet:#8b7cff; --glow:rgba(255,122,162,.35); --border:rgba(255,122,162,.22); --grid:rgba(255,255,255,.04); }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body { margin:0; background:radial-gradient(1200px 800px at 80% -10%, rgba(255,122,162,.18), transparent 60%), radial-gradient(900px 700px at -10% 20%, rgba(139,124,255,.16), transparent 60%), var(--bg); color:var(--ink); font-family:'Inter',system-ui,sans-serif; font-size:14px; -webkit-font-smoothing:antialiased; line-height:1.6; }
  a { color:var(--sakura-2); text-decoration:none; }
  a:hover { color:#fff; text-shadow:0 0 12px var(--glow); }
  .layout { min-height:100vh; }
  aside { position:sticky; z-index:3; top:0; display:flex; align-items:center; gap:22px; min-height:62px; padding:9px clamp(16px,4vw,58px); background:rgba(10,14,26,.7); backdrop-filter:blur(10px); border-bottom:1px solid var(--border); }
  .brand { display:flex; align-items:center; gap:9px; flex:none; text-decoration:none; }
  .brand-mark { display:grid; place-items:center; width:31px; height:31px; background:linear-gradient(135deg,var(--sakura),var(--violet)); border-radius:8px; box-shadow:0 0 18px var(--glow); color:#fff; font:700 16px 'Kinto Sans',sans-serif; }
  .brand-name { display:block; font:700 14px 'Kinto Sans',sans-serif; letter-spacing:-.02em; color:var(--sakura-2); }
  .brand-caption { display:none; }
  .side-label { color:var(--muted); font-size:9px; text-transform:uppercase; letter-spacing:.12em; }
  .topbar { margin:0; }
  .topbar a { display:flex; align-items:center; gap:7px; padding:8px 12px; border:1px solid var(--border); border-radius:999px; background:rgba(255,255,255,.04); font-size:10px; text-decoration:none; transition:all .2s; }
  .topbar a:hover,.browse-toggle:hover { background:rgba(255,122,162,.12); box-shadow:0 0 16px var(--glow); transform:translateY(-1px); }
  .browse-toggle { padding:8px 12px; border:1px solid var(--border); border-radius:999px; background:rgba(255,122,162,.1); color:var(--sakura-2); font:10px 'DM Mono',monospace; cursor:pointer; transition:all .2s; }
  .home-icon { color:var(--sakura); font-size:14px; }
  .nav-search-wrap { display:flex; flex-direction:column; gap:7px; margin-bottom:12px; }
  .nav-search { width:100%; padding:8px 12px; border:1px solid var(--border); border-radius:999px; outline:none; background:rgba(255,255,255,.05); color:var(--ink); font:10px 'DM Mono',monospace; }
  .nav-search:focus { box-shadow:0 0 0 3px var(--glow); border-color:var(--sakura); }
  .nav-search::placeholder { color:#6b6f82; }
  aside nav { display:none; position:absolute; top:calc(100% + 2px); right:clamp(16px,4vw,58px); width:min(360px,calc(100vw - 32px)); max-height:min(70vh,620px); overflow:auto; padding:13px; border:1px solid var(--border); border-radius:14px; background:rgba(14,20,36,.9); box-shadow:0 12px 40px rgba(0,0,0,.45); backdrop-filter:blur(12px); }
  aside nav.open { display:block; }
  aside ul { list-style:none; padding-left:13px; margin:4px 0; border-left:1px solid var(--border); }
  aside li { margin:2px 0; }
  aside li > a { display:block; padding:6px 9px; font-size:10px; text-decoration:none; border-radius:8px; transition:background .15s; }
  aside li > a:hover,aside li > a.active { background:rgba(255,122,162,.12); color:var(--sakura-2); }
  aside .dir { display:block; padding:7px 9px 3px; color:var(--muted); font-size:9px; text-transform:uppercase; letter-spacing:.12em; }
  aside li[hidden] { display:none; }
  main { width:100%; min-height:calc(100vh - 62px); padding:0 clamp(16px,5vw,72px) 80px; background:transparent; }
  .crumb { padding-top:35px; margin:0 0 18px; color:var(--muted); font-size:9px; text-transform:uppercase; letter-spacing:.1em; }
  .crumb a { color:var(--sakura-2); }
  .hero-kicker { width:calc(100% + 2 * clamp(16px,5vw,72px)); margin:0 calc(-1 * clamp(16px,5vw,72px)); padding:clamp(36px,6vw,70px) clamp(16px,5vw,72px) 15px; border-top:1px solid var(--border); background:linear-gradient(135deg, rgba(255,122,162,.18), rgba(139,124,255,.12)); color:var(--sakura-2); font-size:9px; letter-spacing:.14em; text-transform:uppercase; }
  main > h1 { position:relative; width:calc(100% + 2 * clamp(16px,5vw,72px)); max-width:none; margin:0 calc(-1 * clamp(16px,5vw,72px)) 0; padding:0 clamp(16px,5vw,72px) clamp(48px,8vw,96px); overflow-wrap:anywhere; border-bottom:1px solid var(--border); background:linear-gradient(135deg, rgba(255,122,162,.12), rgba(139,124,255,.08)); color:#fff; font:700 clamp(52px,10vw,132px)/.86 'Kinto Sans',sans-serif; letter-spacing:-.06em; text-wrap:balance; text-shadow:0 0 28px var(--glow); }
  .meta { display:flex; flex-wrap:wrap; gap:0; max-width:960px; margin:28px 0 30px; border:1px solid var(--border); border-radius:14px; background:var(--panel); box-shadow:0 8px 32px rgba(0,0,0,.35); overflow:hidden; }
  .meta-row { display:flex; align-items:center; gap:8px; padding:9px 13px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); font-size:9px; }
  .meta-key { color:var(--muted); text-transform:uppercase; }
  .meta-key::after { content:':'; }
  .meta-val { font-weight:500; color:var(--ink); }
  article { max-width:960px; padding:clamp(20px,4vw,46px); border:1px solid var(--border); border-radius:16px; background:var(--panel); box-shadow:0 12px 40px rgba(0,0,0,.4); font-size:13px; line-height:1.8; backdrop-filter:blur(6px); }
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
  article a { color:var(--sakura-2); text-decoration:underline; text-underline-offset:3px; }
  article img { max-width:100%; height:auto; border:1px solid var(--border); border-radius:12px; }
  article hr { margin:2rem 0; border:0; border-top:1px solid var(--border); }
  article table { display:block; width:100%; overflow:auto; border-collapse:collapse; margin:1.3rem 0; font-size:10px; }
  article th,article td { padding:9px 11px; border:1px solid var(--border); text-align:left; }
  article th { background:rgba(255,122,162,.12); color:var(--sakura-2); }
  .listing ul { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:13px; list-style:none; padding:0; }
  .listing li { min-height:92px; padding:17px; border:1px solid var(--border); border-radius:14px; background:var(--panel); box-shadow:0 8px 24px rgba(0,0,0,.3); font-size:11px; transition:transform .2s,box-shadow .2s; }
  .listing li:hover { transform:translateY(-2px); box-shadow:0 0 24px var(--glow); }
  .listing a { font-weight:500; color:var(--sakura-2); }
  .recent-list { display:block; padding:0; grid-template-columns:none; }
  .recent-list li { min-height:0; padding:11px 14px; display:flex; align-items:baseline; justify-content:space-between; gap:14px; background:rgba(255,255,255,.03); border:1px solid var(--border); border-radius:10px; margin-bottom:8px; }
  .recent-time { flex:none; color:var(--muted); font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
  .ticker { overflow:hidden; width:calc(100% + 2 * clamp(16px,5vw,72px)); margin:0 calc(-1 * clamp(16px,5vw,72px)) 28px; padding:9px 0; border-block:1px solid var(--border); background:rgba(255,122,162,.08); color:var(--sakura-2); white-space:nowrap; }
  .ticker span { display:inline-block; padding-left:100%; animation:marquee 32s linear infinite; font-size:9px; letter-spacing:.12em; text-transform:uppercase; }
  @keyframes marquee { to { transform:translateX(-100%); } }
  @media (max-width:760px) {
    aside { gap:12px; min-height:58px; padding:8px 13px; }
    .brand-name { font-size:12px; }
    .topbar a { padding:7px; font-size:8px; }
    .nav-search { width:100%; font-size:9px; }
    .nav-search-wrap { margin-bottom:9px; }
    main { min-height:calc(100vh - 58px); padding:0 16px 50px; }
    .crumb { padding-top:25px; }
    main > h1 { font-size:clamp(42px,13vw,72px); }
    article { padding:19px; }
    article p { overflow-wrap:anywhere; }
    .meta-row { padding:7px 9px; }
  }
  @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation-duration:.01ms!important; transition:none!important; } }

</style>
</head>
<body>
<div class="layout">
  <aside aria-label="Knowledge base navigation">
    <a class="brand" href="${homeHref}">
      <span class="brand-mark" aria-hidden="true">K</span>
      <span><span class="brand-name">Knowledge Base</span><span class="brand-caption">A quiet place to think</span></span>
    </a>
    <div class="topbar"><a href="${homeHref}"><span class="home-icon" aria-hidden="true">⌂</span>Home</a></div>
    <button class="browse-toggle" id="browse-toggle" type="button" aria-expanded="false" aria-controls="notes-nav">Browse +</button>
    <nav id="notes-nav" aria-label="Notes">
      <div class="nav-search-wrap"><label class="side-label" for="nav-search">Find in your workspace</label><input class="nav-search" id="nav-search" type="search" placeholder="Search notes..." autocomplete="off" aria-label="Filter notes"></div>
      ${treeHtml}
    </nav>
  </aside>
  <main>
    <div class="crumb">${currentRel ? `<a href="${homeHref}">Knowledge Base</a> &nbsp;/&nbsp; ${escapeHtml(currentRel)}` : 'Knowledge Base'}</div>
    <div class="hero-kicker">FIELD NOTES &nbsp; / &nbsp; INTERNAL KNOWLEDGE SYSTEM</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="ticker" aria-hidden="true"><span>READ DEEPLY &nbsp; ✳ &nbsp; KEEP CONTEXT &nbsp; ✳ &nbsp; MAKE KNOWLEDGE USEFUL &nbsp; ✳ &nbsp; READ DEEPLY &nbsp; ✳ &nbsp; KEEP CONTEXT &nbsp; ✳ &nbsp; MAKE KNOWLEDGE USEFUL &nbsp; ✳ &nbsp;</span></div>
    ${metaHtml}
    <article>${bodyHtml}</article>
  </main>
</div>
<script>
  const nav = document.querySelector('#notes-nav');
  const browse = document.querySelector('#browse-toggle');
  browse?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    browse.setAttribute('aria-expanded', String(open));
    browse.textContent = open ? 'Close −' : 'Browse +';
    if (open) document.querySelector('#nav-search')?.focus();
  });
  const search = document.querySelector('#nav-search');
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
