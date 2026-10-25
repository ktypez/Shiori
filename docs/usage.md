# Usage

## Reading the knowledge base
1. Open `kb/index.md`.
2. Follow relative links into `kb/concepts/`, `kb/entities/`, `kb/sources/`.
3. Open only the pages a question needs — do not load the whole folder.
4. Cite the pages/sources you used.

You do not need a reader: the KB is plain markdown files, so any editor or `cat`
works. The optional `kbreader` gives a browsable "Recent" view if you want one.

## Capturing durable knowledge (event-driven)
When you learn a durable fact, decision, preference, routine, or project detail:
- Idea/pattern -> `kb/concepts/<slug>.md`
- Tool/person/org/project -> `kb/entities/<slug>.md`
- Provenance -> `kb/sources/<slug>.md`
- New topic -> create a page + add a link in `kb/index.md`
- Keep frontmatter: `type` (required), `title`, `description`, `status`, `stale_after`, `generated`, `sources[]`.
- Append, cross-link, add a one-line entry to `kb/log.md`.
- Validate: every `.md` has frontmatter with non-empty `type`; all relative links resolve.
- Then seal + push (see [salt-backup.md](salt-backup.md)).

Use the `kb-upkeep` skill to automate this.

## Daily automated upkeep
A cron job reviews the last 24 hours of agent sessions and updates the bundle.
See `scripts/salt-daily-backup.sh` and the cron setup in [install.md](install.md).

## Rules
- Never store secrets (tokens, passwords, hashes) in the bundle — reference their location only.
- Canonicalize: update an existing page rather than creating a near-duplicate.
- Keep pages concise; synthesis, not transcripts.
