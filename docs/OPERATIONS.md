# Operations

## Local development

```bash
cd D:/SreeCollections/store
npm install
cp .env.example .env
npm run dev
```

- Storefront: http://localhost:5175
- API: http://localhost:4000
- The API seeds the demo catalogue into `data/sree.db` on first development start.
- Vite proxies `/api` to port 4000, so sessions and CSRF cookies are same-origin.

Stop with `Ctrl+C`; `concurrently -k` stops both processes.

### Reset the development database

Development data is disposable. To start clean:

1. Stop the dev servers.
2. Delete `data/sree.db`, `data/sree.db-wal` and `data/sree.db-shm`.
3. Run `npm run dev` again (auto-seed) or `npm run db:seed`.

Never do this in production.

## Production deployment

### Build

```bash
npm ci
npm run build        # type-checks, builds dist/ and dist-server/
npm prune --omit=dev # optional after building; start does not need dev dependencies
```

`npm start` runs `node dist-server/server/index.js` and serves both the API and `dist/`.

### Environment

```dotenv
NODE_ENV=production
PORT=4000
APP_ORIGIN=https://shop.example.com
DATABASE_PATH=/var/lib/sree-collections/sree.db
COOKIE_SECURE=true
```

- `APP_ORIGIN` is mandatory in production. It must match the browser origin exactly (scheme + host + port, no trailing slash required).
- Keep `.env` outside the release directory, readable only by the service user.
- `DATABASE_PATH` must be on persistent storage.

### Reverse proxy

Terminate TLS at Nginx, Caddy or a load balancer and forward to `127.0.0.1:4000`. The app enables `trust proxy` in production. Example Nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:4000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Do not expose port 4000 publicly. Do not add a CDN that rewrites or caches `/api` responses; the app sets `Cache-Control: no-store` for API routes and `no-cache` for `index.html`.

### systemd example

```ini
[Unit]
Description=Sree Collections store
After=network.target

[Service]
Type=simple
User=sree
WorkingDirectory=/opt/sree-collections/store
EnvironmentFile=/etc/sree-collections/store.env
ExecStart=/usr/bin/node dist-server/server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Create the first owner after the database exists:

```bash
npm run admin:create -- --email owner@real-domain.example --name "Store Owner" --role owner
```

Then sign in, replace the sample catalogue, confirm the preset WhatsApp number (`919494498937`), set the remaining store contacts and address, review the Kurnool and all-India delivery zones, update the policies, and remove the development coupon if it exists.

Order email is optional and off until SMTP is configured:

```dotenv
APP_ORIGIN=https://your-public-domain.example
SMTP_URL=smtp://user:password@host:587
SMTP_FROM="Sree Collections <orders@yourdomain.com>"
```

SMTP_URL accepts `smtp://` (STARTTLS) or `smtps://` (implicit TLS, port 465); URL-encode special characters in the password. Set `SMTP_FROM` to an address the provider has verified. In **Admin → Settings → Order messages**, choose whether the customer and owner receive email and set the owner address (falls back to the store support email). Failed attempts are shown on each order and can be resent; there is no automatic retry scheduler.

WhatsApp handoff needs only a number in **Admin → Settings → Store**. It opens `wa.me` with a prewritten owner message and invoice link; no message is sent by the server.

### First-launch checks

- `GET /api/v1/health` returns `200` with `"database": "ok"`.
- Sign in as owner and open every admin section.
- Place one real COD test order (use a remote PIN such as 110001 to confirm the all-India zone) and move it through confirmed → packed → shipped → delivered.
- Open the invoice from the order page in both HTML and PDF and confirm totals and GST display.
- If SMTP is configured, confirm both invoice emails arrive with the PDF attachment; if not, confirm the order page says no email was sent.
- Confirm the WhatsApp button opens a chat with the order message written in the text box.
- Check the storefront at 360 px width for horizontal scrolling.
- Confirm the development catalogue has been replaced.
- Confirm no `.env`, `data/` or backup files are inside `dist/` or publicly reachable.

## Backup

The database is the only state. Back it up using SQLite's online snapshot so WAL content is included.

### Consistent snapshot (recommended, service can stay up)

```bash
mkdir -p /var/backups/sree-collections
node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/var/lib/sree-collections/sree.db');
db.exec(\"VACUUM INTO '/var/backups/sree-collections/sree-$(date +%Y%m%d-%H%M%S).db'\");
db.close();
"
```

`VACUUM INTO` writes a compact, consistent copy. It requires free disk space roughly the size of the database.

### Cold copy (service stopped)

Stop the service, then copy `sree.db`, `sree.db-wal` and `sree.db-shm` together. Copying only the `.db` while WAL has uncommitted-to-main pages can lose recent orders.

### Verify a backup

```bash
node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/var/backups/sree-collections/sree-YYYYMMDD-HHMMSS.db', { readOnly: true });
console.log(db.prepare('PRAGMA integrity_check').get());
console.log(db.prepare('SELECT COUNT(*) AS orders FROM orders').get());
console.log(db.prepare('SELECT COUNT(*) AS products FROM products').get());
db.close();
"
```

Expected integrity result: `{ integrity_check: 'ok' }`.

### Retention

- Daily snapshots, retained at least 14 days.
- Weekly snapshot, retained 8 weeks.
- Encrypt offsite copies; they contain names, emails, phones and addresses.
- Restrict permissions, for example `chmod 600` and a dedicated backup user.
- Test a restore every quarter. An unverified backup is not a backup.

## Restore

1. Put the store into maintenance mode (Admin → Settings → operational) or stop the service.
2. Take a fresh snapshot of the current database even if it is being replaced.
3. Stop the service.
4. Move the current `sree.db`, `sree.db-wal` and `sree.db-shm` aside; do not delete them until the restore is verified.
5. Copy the chosen backup to `DATABASE_PATH`.
6. Make the service user the owner and restrict permissions (`chown sree:sree`, `chmod 640`).
7. Start the service.
8. Verify `/health`, sign in, open recent orders and check totals and stock.
9. Only then remove the old files.

The app runs migrations on startup. A backup from an older schema is upgraded automatically by the numbered migrations in `server/db.ts`. A backup from a **newer** schema is not downgraded; restore the matching application version.

## Logs and monitoring

- The app logs one JSON line per request: time, level, method, path, status, duration.
- `5xx` responses log at error level; `4xx` at warn. In production, successful requests are not logged to keep noise down.
- Send stdout/stderr to your log collector and rotate them.
- Alert on: `/health` not `200`, repeated `5xx`, disk usage above 80%, backup failure, certificate expiry.
- Database files to watch: `sree.db`, `sree.db-wal`, `sree.db-shm`.

## Routine maintenance

| Interval | Task |
| --- | --- |
| Continuous | Health check every 60 s |
| Daily | Snapshot backup; review failed logins and `5xx` |
| Weekly | Review pending reviews, open tickets and return requests in admin |
| Monthly | Apply dependency updates in a staging copy; run `npm audit` |
| Quarterly | Restore a backup into staging; review staff accounts and roles |
| On staff departure | Disable or delete the account; password changes revoke all sessions |

Expired sessions and guest carts older than 365 days are removed automatically every six hours. No manual cleanup is required for those tables.

## Upgrade procedure

1. Snapshot the database.
2. Deploy the new release beside the old one.
3. Run `npm ci && npm run build`.
4. Stop the service, start the new build (migrations run automatically).
5. Smoke-test health, sign-in, catalogue, cart, a COD order, admin order detail and invoice.
6. Keep the previous build and database snapshot until the new one is accepted.

There is no rollback of migrations. To roll back code, restore the pre-upgrade database snapshot as well.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `Cannot find module 'node:sqlite'` | Node older than 22.5 | Upgrade Node; verify `node -v` |
| `EADDRINUSE` on start | Port already in use | Stop the other process or change `PORT` |
| `APP_ORIGIN must be set explicitly in production` | Missing env value | Set the exact public origin |
| Login succeeds but requests are unauthenticated | Cookies blocked or `COOKIE_SECURE=true` on plain HTTP | Use HTTPS or set `COOKIE_SECURE=false` only for local testing; confirm the proxy forwards cookies |
| `403 CSRF_FAILED` | Missing/stale `sc_csrf` cookie or header | Reload the page; ensure the API client sends `x-csrf-token`; check `APP_ORIGIN` |
| `403 ORIGIN_NOT_ALLOWED` | Browser origin differs from `APP_ORIGIN` | Use the configured host; no `www`/non-`www` mixing |
| `429 RATE_LIMITED` | Per-IP limit hit | Wait for the window; investigate if unexpected |
| `503 PAYMENT_PROVIDER_UNAVAILABLE` | Online payment selected | Expected; choose cash on delivery |
| `503 EMAIL_NOT_CONFIGURED` | Password recovery used, or a message resend without SMTP | Expected without credentials; configure `SMTP_URL`/`SMTP_FROM` or contact the store directly |
| Order shows "Email not configured" | `SMTP_URL` or `SMTP_FROM` missing | Set both, restart, then resend from the order's message log |
| Order email shows `failed` | SMTP rejected the message or the connection timed out | Read the stored error on the order, fix the credentials/sender, resend |
| `SQLITE_BUSY` | Long write transaction or another writer | Check for a second process; busy timeout is 5 s |
| `The storefront build was not found` | `dist/` missing | Run `npm run build` |
| Browser shows old frontend | Cached `index.html` or service worker from another project | Hard reload; confirm no service worker is registered |
| Wide admin table scrolls the whole page | A new table is outside `.table-wrap` | Wrap it; `.table-wrap` uses `contain: paint` |
| E2E cannot start Chrome | Chrome path differs | Edit `tests/e2e.mjs` or install Chrome at the configured path |
| `npm run e2e` fails to find `dist` | Not built | Run `npm run build` first |

## Release archive

When packaging for delivery, exclude:

```
node_modules/
dist/
dist-server/
data/
_qa/
.env
.env.local
*.db
*.db-wal
*.db-shm
test-results/
```

Include source, `public/`, `scripts/`, `tests/`, docs, `package.json`, `package-lock.json`, TypeScript configs, `vite.config.ts` and `.env.example`. Never include real credentials, local databases or customer data.

See [Known limitations](KNOWN_LIMITATIONS.md) before launch.
