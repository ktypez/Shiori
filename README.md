# Shiori — universal file-based memory for AI agents

A system scaffold for a **shared, versioned, encrypted knowledge base** used by
local AI agents (Hermes, opencode, and others). Named *Shiori* (栞, "bookmark"):
a universal index into durable knowledge, with no personal name attached.

## System vs. data

This repository contains **only the system**: docs, scripts, the optional markdown
reader, the opencode template, the upkeep skill, and the agent contract.

It does **not** contain knowledge data. The live bundle lives at `~/kb` (or any
path you choose) and is backed up separately with **Salt** to a private GitHub
repo. Salt handles encryption, filenames, signing, and the 12-word recovery
passphrase. Do not commit `~/kb` to this repository — the data route is Salt's.

## What Shiori is

- **KB** = Open Knowledge Format (OKF) v0.2 bundle: plain markdown + YAML
  frontmatter, navigated by `index.md` and relative links. No database, no
  embeddings, no runtime. `cat` reads it, `git clone` ships it.
- **Salt** = encrypts the bundle (and a safe copy of `state.db`) before it
  leaves the machine: filenames hidden, public-key signed, restore via 12-word
  passphrase. Daily cron seals + pushes to a private GitHub repo.
- **kbreader** = optional pure-Node markdown reader with a "Recent" view.
- **kb-upkeep** skill = event-driven capture of durable knowledge.
- **opencode integration** = ambient instructions only (file-based access; no MCP).

## Quick start

See [docs/install.md](docs/install.md).

## Layout

```
scripts/     # salt-daily-backup.sh
kbreader/    # markdown reader (Node)
opencode/    # opencode.json template (instructions only)
skills/      # kb-upkeep skill (global ~/.agents/skills)
docs/        # install, usage, salt-backup
AGENTS.md    # contract for all agents
```

## Data location

The OKF bundle is created at `~/kb` during install (see docs/install.md). It is
kept out of this repository and backed up via Salt. See
[docs/salt-backup.md](docs/salt-backup.md).