# AGENTS.md — shared knowledge base

This directory (`kb/`) is a shared OKF (Open Knowledge Format) knowledge base used by all local agents (Hermes, opencode, and others). Treat it as durable, cross-agent memory.

## How to read
1. Start at `kb/index.md`.
2. Follow relative links into `kb/concepts/`, `kb/entities/`, `kb/sources/`.
3. Open only the pages a question needs — do not load the whole folder.
4. Each page ends with a `## Sources` section; cite the pages and sources you used.
5. If something is not covered, say so instead of guessing.

## How to write (durable knowledge only)
Capture a fact, decision, preference, routine, or project detail you learned:
- Idea/pattern -> `kb/concepts/<slug>.md`
- Tool/person/org/project -> `kb/entities/<slug>.md`
- Provenance -> `kb/sources/<slug>.md`
- New topic -> create a page + add a link in `kb/index.md`
- Keep frontmatter: `type` (required), `title`, `description`, `status`, `stale_after`, `generated`, `sources[]`.
- Append, cross-link, then add a one-line entry to `kb/log.md`.

## Access (file-based)
No MCP server is used. All agents read and write the bundle with ordinary file tools, following the read/write/seal rules above. `kb/index.md` is the entry point; open only the pages a question needs.

## Backup (Salt)
After writing, seal + push so the change is encrypted and versioned:
```bash
cd ~/my-backup-repo
salt seal --prune --sqlite ~/.hermes/state.db ~/kb ~/my-backup-repo
if [ -n "$(git status --porcelain)" ]; then
  git add . && git commit -m "kb upkeep $(date -u +%Y-%m-%dT%H:%M:%SZ)" && git push --force-with-lease origin master
fi
```
Daily/weekly cron also seals automatically.

## Rules
- Never store secrets (tokens, passwords, hashes) here — reference their location only.
- Canonicalize: update an existing page rather than creating a near-duplicate.
- Keep pages concise; synthesis, not transcripts.
