# MFEC Insurrance

MFEC Insurrance is a fictional motor-insurance demonstration application. It has a public Thai product website, an authenticated management portal, JSON-backed customer/policy/renewal/campaign workflows, CSV export, and a server-side Genesys Cloud integration. It does not issue real policies or take payment. Use only synthetic customer data.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm. No database or Docker is required.

```bash
npm install
npm test
npm run build
npm start
```

Create a server-only `.env` from `.env.example` before `npm start`. Set persistent random values for `APP_SECRET` and `SESSION_SECRET`, and a strong `ADMIN_PASSWORD` for the first boot. The application hashes this bootstrap password into `data/.auth/admin.json`; later changes are made under `/backend/settings` and persist independently of `.env`. Once the credential file exists, remove the bootstrap `ADMIN_PASSWORD` from `.env` so an old password cannot become a fallback if the credential file is lost. The production server listens on `127.0.0.1:3000` unless `HOST`/`PORT` are set. For local development run `npm run dev:server` and `npm run dev:client` in separate terminals; Vite is at `http://localhost:5173` and proxies `/api` to the Express server on port 3000. The development-only default login is `admin` / `ChangeMe123!`; override it via `.env` for any shared environment.

## Routes

| Path                                           | Purpose                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| `/`                                            | Public homepage                                          |
| `/products`, `/products/:slug`                 | Catalog, comparison, product detail                      |
| `/recommend`                                   | Product recommendation wizard                            |
| `/contact`                                     | Callback request                                         |
| `/backend/login`                               | Admin login                                              |
| `/backend`                                     | Dashboard                                                |
| `/backend/customers`, `/backend/customers/:id` | Customer CRUD and 360 view                               |
| `/backend/products`, `/backend/policies`       | Product and policy CRUD                                  |
| `/backend/renewals`, `/backend/campaigns`      | Renewal and campaign management                          |
| `/backend/inquiries`, `/backend/audit`         | Inquiries and audit                                      |
| `/backend/genesys`, `/backend/settings`        | Genesys configuration, password change, and backup/reset |

The public website cannot access `/api/admin/*`. Admin APIs use a signed, HTTP-only session cookie, same-origin checks on mutations, a login rate limit, and file-backed sessions. In production the cookie requires HTTPS. Changing the admin password requires the current password and invalidates all existing admin sessions. Client Secret and OAuth tokens are never returned to the browser.

### Public policy renewal API

`POST /api/public/policies/renew` accepts JSON with a single `policyNumber` field and does not require authentication:

```bash
curl -X POST https://tiscodemo.bsmrpa.com/api/public/policies/renew \
  -H 'Content-Type: application/json' \
  -d '{"policyNumber":"YOUR_POLICY_NUMBER"}'
```

The response contains the policy number, new effective and expiry dates, `renewalStatus: "RENEWED"`, and `alreadyRenewed`. The first renewal also returns the previous expiry date. A successful renewal starts the next coverage period the day after the old expiry and extends expiry by one calendar year (Feb 29 becomes Feb 28). Repeated requests within 24 hours return the current dates without adding another year. Cancelled policies return 409; missing policies return 404. The route is limited to 60 requests per hour per IP. Admin policy and renewal screens refresh through an authenticated Server-Sent Events stream when a renewal occurs, including renewals triggered by this API. The admin Renew buttons use a session-protected endpoint and the same business logic.

**Security:** This unauthenticated endpoint can change demo policy records for anyone who knows a policy number. Do not use it for real insurance data without adding an authorization mechanism or upstream access control.

## Data and backups

All business records live in `data/*.json`. On first boot the app seeds 30 customers, 10 products, 40 policies, 5 inquiries, and 6 campaigns. `CUST00001` and `POL00001` are the sample customer/policy. JSON writes are serialized per file and atomic. `data/config/*.json` holds Genesys regions and encrypted configuration; `data/.auth/admin.json` holds the salted admin password hash; `data/.sessions/` stores sessions. None of these generated files should be committed.

The admin Settings page creates backups under `backups/` before download or demo reset. Downloaded backups redact Genesys OAuth credentials and omit the admin credential hash; server-side backup files include encrypted Genesys configuration. When moving servers, preserve `APP_SECRET` to decrypt an existing Client Secret, or enter a new Client Secret in the UI. Use a filesystem-level backup of both `data/` (including `.auth/`) and `.env` for full disaster recovery. `DATA_DIR`, `BACKUPS_DIR`, and `EXPORTS_DIR` can be set to move runtime data.

## Genesys Cloud setup

1. Log in to `/backend`, open Genesys Cloud, and choose the region. Singapore (`apse1`) is the default. Region URLs can be edited, tested, reset, and custom regions added from the Regions tab.
2. Enter the OAuth Client ID and Client Secret for a Client Credentials integration, then save. The secret is encrypted at rest with `APP_SECRET` (AES-256-GCM). Test Connection checks OAuth and the outbound Contact Lists API. The OAuth client needs the Genesys outbound Contact List and Contact permissions required by the operations it will perform.
3. Load Contact Lists, select one, and save. Set `phoneColumn` to the Genesys phone column (default `phone`). Validate Schema. The target list must have all 23 canonical columns with exact case and the phone column configured as a phone column; extra columns are reported but do not block sync.
4. Preview a campaign or renewal group. DNC customers, invalid/duplicate phones, and unchanged contacts are excluded. Export a UTF-8 BOM/CRLF CSV, or confirm Sync to Genesys. The UI sends controlled batches and displays progress and failed IDs. Individual policies can be pushed from Policy Detail.

The server builds one canonical contact record for CSV and API. It sends `POST /api/v2/outbound/contactlists/{id}/contacts` only when there is no existing contact. For an existing changed contact it does GET, merges MFEC data into the complete Genesys contact, and PUTs it. It stores the Genesys Contact ID and a SHA-256 payload hash, and marks locally changed records `OUTDATED`. Network retries are limited to read/update operations; POST is not automatically retried to avoid duplicates after an ambiguous response.

## Production deployment

The intended domain is `https://tiscodemo.bsmrpa.com`: public pages live at `/`, and all management pages live under `/backend`. The application is deployed to `/app/tiscoinsure` on the Ubuntu host. DNS must point to the server, TCP 80/443 must be open, and port 3000 must remain private. Nginx terminates TLS and proxies to `127.0.0.1:3000`. Use [production.conf](deploy/nginx/production.conf) after obtaining a Let's Encrypt certificate. [bootstrap.conf](deploy/nginx/bootstrap.conf) supports the first HTTP/certificate bootstrap. The [renewal hook](deploy/letsencrypt/reload-nginx.sh) reloads Nginx after certificate renewal. The public site is intentionally unauthenticated; **do not enable global HTTP Basic Auth**.

Example initial Ubuntu setup (replace email and secrets, run from a privileged account):

```bash
sudo apt update
sudo apt install -y nginx certbot git
## Install Node.js 22 LTS from its official distribution, then verify:
node --version
npm --version
sudo mkdir -p /app /var/www/letsencrypt
sudo chown ubuntu:ubuntu /app
git clone https://github.com/neston2609/tiscoinsure.git /app/tiscoinsure
cd /app/tiscoinsure
cp .env.example .env
chmod 600 .env
npm ci
npm test
npm run build
sudo mkdir -p /app/tiscoinsure/backups /app/tiscoinsure/exports
sudo cp deploy/nginx/production.conf /etc/nginx/sites-available/tiscoinsure
sudo ln -s /etc/nginx/sites-available/tiscoinsure /etc/nginx/sites-enabled/tiscoinsure
sudo nginx -t
sudo systemctl reload nginx
```

Set the `.env` values before starting the service. For an existing deployment, back up `data/` and `.env`, update Git with `git pull --ff-only`, run `npm ci && npm test && npm run build`, then restart the application. A sample systemd unit is provided at [mfec-insurrance.service](deploy/systemd/mfec-insurrance.service); install it only if the host is not already running this application via PM2. The current server uses PM2. Do not run PM2 and systemd copies on the same port.

Verify after deployment:

```bash
curl -I https://tiscodemo.bsmrpa.com/
curl -I https://tiscodemo.bsmrpa.com/backend/login
curl https://tiscodemo.bsmrpa.com/api/health
curl -i https://tiscodemo.bsmrpa.com/api/admin/customers
```

The last request should return HTTP 401 without an admin session. `GET /api/health` should return `ok: true`. Check Nginx and process logs if either public route fails.

## Tests

`npm test` covers Thai phone normalization, Bangkok-relative expiry, DNC/campaign preview, safe CSV encoding, Genesys schema comparison, mocked Genesys create/no-op/update/DNC/mismatch, password changes/session invalidation/restart persistence, and an isolated HTTP workflow for public requests, session auth, CRUD, campaign export, and backup redaction. The HTTP test uses temporary data directories and does not touch production JSON files.
