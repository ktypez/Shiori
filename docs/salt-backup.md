# Salt backup integration

Salt (spicy-lemonade/salt, MIT, beta) encrypts the knowledge base before it
leaves the machine.

## What it does
- Encrypts files (and SQLite/Postgres DBs) before they reach GitHub.
- Hides filenames by default (a name like `job_search_new_york.md` says a lot).
- Signs every backup with your public key; restore/verify refuse unsigned backups.
- Restore into a new folder (never overwrites); recovery via 12-word passphrase.
- `salt doctor`, `salt verify`, `salt recovery test`, `salt trust`.

## Daily flow
```bash
cd ~/my-backup-repo
salt seal --prune --sqlite ~/.hermes/state.db ~/kb ~/my-backup-repo
if [ -n "$(git status --porcelain)" ]; then
  git add . && git commit -m "salt backup $(date -u +%Y-%m-%dT%H:%M:%SZ)" && git push --force-with-lease origin master
fi
```
On no change, stay silent (watchdog).

## Presets
Salt has a `hermes` preset that finds Hermes files + databases automatically:
```bash
salt backup --preset hermes ~/my-backup-repo
```

## Pruning
Encrypted files can't compress against older versions, so repos grow.
```bash
salt prune ~/my-backup-repo                  # keep last 5 days with a change
salt prune --keep-days 10 ~/my-backup-repo    # keep 10
```
Pruning rewrites git history -> push with `--force-with-lease`.

## Caveats
- Salt is beta; expect breaking changes.
- Keyring may be unavailable on lab hosts -> key stored in a file; protect it.
- `--sqlite` needs the `sqlite3` program on PATH.
- Recovery passphrase loss = unrecoverable.
- state.db seal is a snapshot; re-seal to capture new messages.
