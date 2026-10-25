# Install

## Prerequisites
- Python 3.11+, Node.js 18+, git, curl.
- (Optional) Go 1.26+ to build Salt from source (no prebuilt binaries).

## 0. One-shot system install (optional)

Instead of copying files by hand, run:

```bash
./install.sh
```

It copies the skill, the daily backup script, and (if missing) `AGENTS.md`
into `~/kb`. It never overwrites your knowledge data or your opencode config.

## 1. Knowledge base
```bash
mkdir -p ~/kb/concepts ~/kb/entities ~/kb/sources
cp kb/index.md kb/log.md ~/kb/
cp AGENTS.md ~/kb/AGENTS.md   # or keep at repo root
```
Edit `~/kb/index.md` to taste. The bundle is plain markdown; `cat` reads it.

## 2. Salt (encrypted backup)
Salt has no prebuilt binaries — build from source:
```bash
# install Go (example: download tarball to ~/.local)
go install github.com/spicy-lemonade/salt/cmd/salt@latest
# sqlite3 CLI (Salt --sqlite needs it); build from amalgamation if missing
export PATH=$HOME/.local/bin:$PATH
```
Then:
```bash
mkdir -p ~/my-backup-repo && cd ~/my-backup-repo && git init
salt init ~/my-backup-repo --recovery passphrase --passphrase-file /path/to/passphrase.txt
salt seal --prune --sqlite ~/.hermes/state.db ~/kb ~/my-backup-repo
salt doctor && salt verify ~/my-backup-repo
```
Store the recovery passphrase somewhere safe (vault). Loss = unrecoverable.

## 3. Daily cron
```bash
cp scripts/salt-daily-backup.sh ~/.hermes/scripts/
chmod +x ~/.hermes/scripts/salt-daily-backup.sh
```
Create a cron job (Hermes) or add to crontab:
```
0 3 * * * ~/.hermes/scripts/salt-daily-backup.sh
```

## 4. kbreader (optional markdown reader)
```bash
cd kbreader && pnpm install   # or npm
./start.sh                    # port 8124, BASE_PATH=/kb
```

## 5. opencode integration (optional)
Copy `opencode/opencode.json` to `~/.config/opencode/opencode.json` (merge with yours).
Place the `kb-upkeep` skill in `~/.agents/skills/kb-upkeep/SKILL.md`.
Access is file-based: point `instructions` at `~/kb/AGENTS.md`; no MCP server is used.

## 6. GitHub remote
```bash
gh repo create <name> --private
cd ~/my-backup-repo
git remote add origin https://github.com/<user>/<name>.git
git push -u origin master --force-with-lease
```
