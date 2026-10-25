# Shiori — universal file-based memory for AI agents

![Shiori banner](assets/banner.png)

> **Shiori** (栞, "bookmark") is a universal, file-based memory system for AI
> agents. It turns a folder of plain Markdown into a shared, versioned,
> encrypted knowledge base — no database, no embeddings, no runtime. `cat` reads
> it. `git clone` ships it.

<p align="center">
  <img src="assets/icon.png" alt="Shiori icon" width="128" />
</p>

---

## Why Shiori

AI agents forget. Vector stores are opaque. Databases need migrations. Shiori
takes the opposite approach: **durable knowledge is just Markdown with YAML
frontmatter**, navigated by an index and relative links. Every agent that can
read a file can read it. Every human with a text editor can edit it. Every
change is captured, validated, and sealed into an encrypted backup.

- **File-based** — no server, no schema, no vendor lock-in.
- **Cross-agent** — Hermes, opencode, and any future agent share one bundle.
- **Encrypted backup** — Salt signs and encrypts before anything leaves the
  machine.
- **Optional reader** — a dark, night-sakura web UI for humans; the KB works
  without it.
- **Agent-neutral contract** — `AGENTS.md` is the single source of truth.

## Features

| | |
|---|---|
| **OKF v0.2 bundle** | `index.md` + `concepts/` + `entities/` + `sources/` + `log.md` |
| **Frontmatter** | `type`, `title`, `description`, `status`, `stale_after`, `generated`, `sources[]` |
| **Validation** | `okf_validate.py` — conformant = exit 0 |
| **Encrypted backup** | Salt seals `~/kb` + a safe `state.db` snapshot to a private repo |
| **Daily upkeep** | Cron reviews the last 24 h of sessions and updates the bundle |
| **File-based access** | `instructions` only — no MCP, no bridge, no token collision |
| **Optional reader** | Pure Node HTTP server, Kinto Sans, dark night-sakura theme |
| **Service vs. dev** | `deploy.sh` syncs the repo into a non-git service root |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Dev (this repo)                        │
│  README · docs · scripts · kbreader · opencode template     │
│  skills · AGENTS.md · install.sh · deploy.sh · assets       │
└──────────────────────────┬──────────────────────────────────┘
                           │  ./deploy.sh
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Service (live machine)                      │
│  ~/kb  (data)   ~/.config/opencode   ~/.agents/skills       │
│  ~/.hermes/scripts   ~/.local/share/shiori (reader)         │
└──────────────────────────┬──────────────────────────────────┘
                           │  salt seal
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Private backup repo (encrypted)                │
│  filenames hidden · public-key signed · 12-word recovery    │
└─────────────────────────────────────────────────────────────┘
```

> **Rule:** the repo ships the *system*. Salt ships the *data*. They never mix.

## Quick start

### 1. Install the system

```bash
git clone https://github.com/ktypez/Shiori.git
cd Shiori
./install.sh            # copies skill, backup script, AGENTS.md (if missing)
```

### 2. Create your knowledge bundle

```bash
mkdir -p ~/kb/concepts ~/kb/entities ~/kb/sources
cp kb/index.md kb/log.md ~/kb/
# edit ~/kb/index.md, then capture durable knowledge into concepts/entities/sources
```

### 3. Point an agent at the contract

```bash
# merge into your own opencode config
cp opencode/opencode.json ~/.config/opencode/opencode.json
# place the upkeep skill
cp -r skills/kb-upkeep ~/.agents/skills/
```

### 4. (Optional) browse it

```bash
cd kbreader && pnpm install && ./start.sh   # http://localhost:8124
```

### 5. Back it up

```bash
mkdir -p ~/my-backup-repo && cd ~/my-backup-repo && git init
salt init ~/my-backup-repo --recovery passphrase --passphrase-file /path/to/passphrase.txt
salt seal --prune --sqlite ~/.hermes/state.db ~/kb ~/my-backup-repo
```

See [docs/install.md](docs/install.md) for the full walkthrough and
[docs/salt-backup.md](docs/salt-backup.md) for pruning and recovery.

## For agents

Agents read and write the bundle with ordinary file tools. The contract lives at
`~/kb/AGENTS.md` and is loaded into every opencode session via `instructions`.

```text
Read  →  start at ~/kb/index.md, follow relative links, open only what you need
Write →  concepts/<slug>.md | entities/<slug>.md | sources/<slug>.md
        then append one line to ~/kb/log.md
Seal  →  salt seal --prune --sqlite ~/.hermes/state.db ~/kb ~/my-backup-repo
```

The `kb-upkeep` skill automates capture, validation, and sealing.

## Example page

```markdown
---
type: Concept
title: Model routing
description: How agents pick provider/model aliases.
status: stable
stale_after: "2027-10-25T00:00:00Z"
generated: { by: "agent", at: "2026-10-25T00:00:00Z" }
sources: []
---

# Model routing

Explain how the agent selects a provider/model, and link to related pages.
```

## Optional reader

A pure-Node markdown reader with a dark **night-sakura** theme and **Kinto Sans**
typography. It is not required — without it the KB is just files on disk.

```bash
cd kbreader && pnpm install && ./start.sh   # http://localhost:8124
```

## Data location

The OKF bundle is created at `~/kb` during install. It is kept out of this
repository and backed up via Salt. See [docs/salt-backup.md](docs/salt-backup.md).

## Service vs. dev

- **Dev** = this repository (`~/projects/shiori` or a clone). Edit code, docs,
  templates, and skills here; commit and push.
- **Service** = the live locations on a machine (`~/kb`, `~/.config/opencode`,
  `~/.agents/skills`, `~/.hermes/scripts`). Updated only by `./deploy.sh`,
  never by editing in place.
- `./deploy.sh` copies the system into `$SHIORI_SERVICE_ROOT`
  (default `~/.local/share/shiori`, no git) and then runs `install.sh`.

Keep the two separate: the repo ships the system, Salt ships the data, and
`install.sh` / `deploy.sh` are the one-way bridges.

## Credits

- **[Salt](https://github.com/spicy-lemonade/salt)** (MIT) — encrypted backup
  of the knowledge base and database memories before they leave the machine.
- **[OKF](https://github.com/scaccogatto/okf-skills)** — the Open Knowledge
  Format v0.2 bundle structure and validator.
- **[Kinto Sans](https://github.com/ookamiinc/kinto)** (OFL-1.1) — Japanese UI
  font used by the optional reader.

## License

MIT. See [LICENSE](LICENSE).