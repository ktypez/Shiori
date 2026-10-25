# KB Reader

Markdown reader for the OKF knowledge base at `~/kb`. Pure Node.js HTTP server
(no build step), rendering markdown with `marked` and YAML frontmatter with
`gray-matter`.

## Run

```bash
./start.sh                          # port 8124, BASE_PATH=/kb
PORT=8125 BASE_PATH='' node server.mjs   # standalone, root links
```

## Config (env)

- `KB_ROOT`  — knowledge base dir (default `/home/admin/kb`)
- `PORT`     — listen port (default `8124`)
- `HOST`     — bind address (default `0.0.0.0`)
- `BASE_PATH`— public mount path (default `/kb`). Set to the dashboard route
  prefix so all links resolve through the dashboard proxy.

## Dashboard integration

- Reader listens on `127.0.0.1:8124` with `BASE_PATH=/kb`.
- Dashboard proxies `/kb/[...slug]` → reader (see
  `src/routes/kb/[...slug]/+server.ts`), so the link is same-origin.
- Home page adds a "Knowledge Base" quick-link card (`/kb/`).

## Service

```bash
sudo ./install-service.sh
```

Installs `systemd/kbreader.service` (enabled, auto-restart).
