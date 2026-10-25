---
name: kb-upkeep
description: "Use when capturing durable knowledge into the shared OKF knowledge base at ~/kb (used by all local agents). Read index first, update the right page, cite sources, seal with Salt."
tags: [knowledge, okf, memory, backup, salt]
triggers:
  - remember this
  - note that
  - durable fact
  - update knowledge base
  - KB upkeep
---

# KB upkeep (shared Hermes OKF bundle)

## When to use
- You learned something durable during a task: a fact, decision, preference, routine, project detail, or user profile info.
- The user said "remember this", "note that", or corrected a prior assumption.
- After finishing a task that produced reusable knowledge (new tool, new workflow, new constraint).

Do NOT use for ephemeral chatter, one-off commands, or transient state.

## Bundle location
- `~/kb` (OKF v0.2): `index.md`, `concepts/`, `entities/`, `sources/`, `log.md`.
- Backup: `~/my-backup-repo` (Salt), pushed to your private backup repo.
- Shared by all local agents (Hermes, opencode, ...). Keep it agent-neutral.

## Procedure
1. Decide the target page.
   - Idea/technique/pattern -> `concepts/<slug>.md`.
   - Tool/person/org/project -> `entities/<slug>.md`.
   - Provenance pointer -> `sources/<slug>.md`.
   - New durable topic with no page -> create new page + add link in `index.md`.
2. Update the page.
   - Keep frontmatter: `type`, `title`, `description`, `status`, `stale_after`, `generated`, `sources[]`.
   - Set `stale_after` ~1 year out unless time-sensitive.
   - Append, don't rewrite unrelated content. Cross-link with relative links.
3. Update `index.md` if a new page was added.
4. Append a one-line entry to `log.md` (ISO timestamp + what changed).
5. Validate: frontmatter present with `type`; all relative links resolve.
6. Seal + push:
   ```bash
   cd ~/my-backup-repo
   salt seal --prune --sqlite ~/.hermes/state.db ~/kb ~/my-backup-repo
   if [ -n "$(git status --porcelain)" ]; then
     git add . && git commit -m "kb upkeep $(date -u +%Y-%m-%dT%H:%M:%SZ)" && git push --force-with-lease origin master
   fi
   ```
7. Reply with one line: what page changed.

## Migrating a legacy memory store (e.g. minimem) into OKF

A memory service's DB is not a 1:1 source of pages. Migrate by **synthesis**, not copy:

1. **Assess scale first.** Count entries and the boilerplate ratio (`text like '%Migrated from brain%'` etc.). If there are hundreds of unique, granular entries, a 1:1 migration floods the KB with noise.
2. **Group by topic**, not by entry. Create one concept/entity page per durable topic that synthesizes all related entries; drop migrated boilerplate and transient session notes.
3. **Keep a raw archive for provenance.** Dump the full store to a file outside the bundle (e.g. `~/kb-archive/<source>-dump.txt`) and, if useful, a condensed `sources/<source>-archive.md`. Do not put 1MB of raw entries into a single navigable page.
4. **Filter before synthesizing.** Skip entries that are auto-generated, migrated boilerplate, or one-off session transcripts; keep facts, decisions, gotchas, project details, and user profile.
5. **Validate** (frontmatter `type`, relative links resolve) and seal+push as usual.

When minimem is the source: its DB lives at `<path-to-minimem.db>` (SQLite; tables `memories`, `tags`, `history`). Native (non-migrated) entries are the higher-value subset.

## Rules
- Never store secrets (tokens, passwords, hashes) in the bundle — reference their location only.
- Prefer updating an existing page over creating a near-duplicate (canonicalize).
- Keep pages concise; synthesis, not transcripts.
- If unsure whether something is durable, ask the user before writing.
- Upkeep cron runs daily at 04:00 UTC (`kb-daily-upkeep`), not weekly; review the last 24h of sessions.
