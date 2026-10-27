# StayOS

StayOS is a hostel/PG management SaaS. Property owners manage properties → rooms → beds → residents → stays → rent charges → payments → check-out and refunds → complaints → expenses → reports. Roles: **owner**, **warden**, **maintenance** (staff, with per-property permissions) and **student**. Every record is scoped to a property the caller can access, and students only ever see their own records.

> **Status:** all eight phases are complete: auth + RBAC, inventory, residents/stays, rent and payments, check-out and refunds, complaints, expenses, reports and dashboard, student portal, notifications, staff permissions, audit log, seed data and hardening.

## Architecture

```mermaid
flowchart LR
  subgraph Client["React + Vite client"]
    OW["Owner / warden app"]
    ST["Student portal"]
  end
  subgraph API["Express API (stateless)"]
    MW["helmet CSP · origin guard · CORS · sanitize · rate limits · CSRF · request context"]
    AU["authenticate → authorize(role) → requirePermission → validate (Zod)"]
    SV["Services: stays, charges, payments, balances, check-out, refunds,<br/>complaints, expenses, reports, notifications, staff, audit"]
    JB["Jobs: rent reminders · overdue reconcile · upcoming move-ins/outs"]
  end
  DB[("MongoDB<br/>transactions on a replica set,<br/>conditional updates + compensation otherwise")]
  EM["Email transport<br/>(JSON log in dev, SMTP in prod)"]
  OW -->|JSON + httpOnly cookies| MW
  ST -->|JSON + httpOnly cookies| MW
  MW --> AU --> SV --> DB
  JB --> SV
  SV -->|notify| EM
  SV -->|append-only| AL[("auditLogs")]
```

Design rules that hold everywhere:

- **Money is integer paise** end to end; floats are rejected by validation, never rounded. Dates are UTC; "today" and month boundaries use the business timezone (IST) in one place (`utils/dates.js`).
- **Financial records are never edited or deleted.** Payments are corrected by reversal entries, charges by adjustments or waivers, expenses by voiding, refunds by cancelling. Mongoose refuses deletes on these models.
- **The server computes every derived number** (net due, outstanding, refundable, receipt numbers, statuses, report figures). Request schemas are `.strict()`, so a client that sends `receiptNumber`, `status`, `netDuePaise`, `refundablePaise` and the like gets a 400 instead of being trusted.
- **Idempotency is built in**: charge generation (unique stay+period), payments (per-property idempotency keys), check-out (single conditional update), notifications (unique dedupe keys).

## Prerequisites

- Node.js 20+ and npm
- MongoDB running locally (`mongodb://127.0.0.1:27017`) or a MongoDB Atlas URI

## Install

```bash
npm run install:all
cp server/.env.example server/.env   # then edit secrets
cp client/.env.example client/.env
```

## Run

```bash
npm run dev      # server on :5001, client on :5173
npm test         # server tests (Vitest + Supertest)
npm run lint     # ESLint on both apps
```

- API health: <http://localhost:5001/api/health>
- Client: <http://localhost:5173>

> **Port:** the API defaults to `5001` because macOS AirPlay Receiver occupies `5000`. If you change
> `PORT` in `server/.env`, update `VITE_API_URL` in `client/.env` to match.
>
> The API needs a reachable MongoDB at `MONGO_URI` (local `mongod`, Docker, or Atlas) and retries
> 5 times before exiting. Quick local option: `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`.

## Folder map

```
stayos/
├── client/            React + Vite + Tailwind + React Router + TanStack Query
│   └── src/
│       ├── components/  shared UI by area (rent/, refunds/, complaints/, staff/, notifications/ ...)
│       ├── pages/       owner/warden pages, student/ portal, notifications/, reports/ ...
│       ├── layouts/     AppShell (staff) and StudentShell
│       ├── services/    axios instance + one API module per area
│       └── lib/         formatting, permission catalog, roles
└── server/            Node + Express + Mongoose (ES modules)
    ├── src/
    │   ├── config/      env, db, transactions, permissions catalog
    │   ├── middleware/  authenticate, authorize, requirePermission, sanitize, originGuard, requestContext, rate limiters
    │   ├── models/ validators/ routes/ controllers/ services/
    │   ├── jobs/        rentReminders, overdueReconcile, upcomingEvents, scheduler
    │   ├── scripts/     seed.js
    │   └── app.js · server.js
    └── tests/           Vitest + Supertest on mongodb-memory-server
```

## Conventions

- Success: `{ "success": true, "data": ..., "message": "..." }`
- Error: `{ "success": false, "message": "...", "errors": [...]? }` (stack traces only outside production)
- Validation uses Zod via `validate({ body, params, query })`.
- Controllers are wrapped with `asyncHandler`; throw `ApiError` for expected failures.

## Authentication

Endpoints under `/api/auth`: `register`, `login`, `logout`, `refresh`, `me`, `forgot-password`, `reset-password`, `verify-email`.

- Access token (15 min) and refresh token (7 days, rotated on every use) live in HTTP-only `SameSite=Lax` cookies (`Secure` in production). Refresh tokens are stored hashed in `refreshTokens`; replaying a rotated token revokes all of that user's sessions.
- Only `owner` can self-register; other roles are invited (a later phase).
- There is no email provider yet: verification and reset tokens are logged to the server console outside production.
- Route guards: `authenticate`, `authorize(...roles)`, `requireSelfOrRole(...roles)`. Property scoping helpers `getUserPropertyIds` / `assertPropertyAccess` live in `server/src/services/propertyAccess.service.js`.
- Server tests run against an in-memory MongoDB (`mongodb-memory-server`, downloaded on first run).

## Inventory (properties → rooms → beds)

- Endpoints: `/api/properties`, `/api/properties/:propertyId/{overview,beds,rooms}`, `/api/properties/:propertyId/rooms/:roomId/beds` (+ `/bulk`). Lists take `?page=&limit=` (limit ≤ 500) and return `{ items, pagination }`.
- **Money is stored as integer paise** everywhere (`utils/money.js`). The API accepts and returns rupees (max 2 decimals); Zod validators convert to paise on the way in and `utils/serializers.js` converts back on the way out. Follow this in every later phase.
- **Tenant isolation:** every nested route runs `requirePropertyAccess(permission?)` (→ `assertPropertyAccess`) before touching children, and every child query is also filtered by `property`. A property you cannot reach is a `404`, not `403`; `403` means you can see it but lack the write permission.
- Warden write permissions live in `User.propertyAccess[].permissions` (`rooms:write`, `beds:write`; see `config/permissions.js`). Owners hold all; maintenance is read-only.
- Bed `status` is stored, not derived from stays. `occupied` can only be set by Phase 3 stay flows. Deleting a room/bed is a soft delete (`inactive`); inactive beds don't count toward room capacity and keep their label.
- `outstandingRent` in the overview is still a stub (Phase 4).

## Residents & stays

- **Residents** are people, **users** are logins. `POST /api/residents/:id/invite` creates a `student` user in `invited` state linked via `resident.userId`; the invitee sets a password with the one-time token at `/reset-password?token=…`, which activates the account. Outside production the raw token is returned (and logged) because there is no email provider yet.
- **Stays** (`/api/stays`): `action: "checkin"` marks the bed `occupied`; `action: "reserve"` (future date only) marks it `reserved` and sets `reservationTimer` to the arrival date. Reservations are not auto-promoted yet. `POST /stays/:id/transfer` ends the stay (`endedReason: "transfer"`) and opens a linked one on the new bed. `POST /stays/:id/end` returns 501 until Phase 5.
- **Stay money fields end in `Paise` and are integer paise on the wire** (e.g. `monthlyRentPaise: 450000` = ₹4,500). Inventory endpoints (rooms/beds) still use rupees.
- **Dates** on stays are `YYYY-MM-DD` and "today" is evaluated in `Asia/Kolkata` (`utils/dates.js`).
- **Concurrency:** a bed is claimed with an atomic `findOneAndUpdate({ status: 'available' })`, and the partial unique indexes `uniq_active_stay_per_bed` / `uniq_active_stay_per_resident` backstop it in the database. On a replica set every multi-document change runs in a transaction (`config/transactions.js`); on standalone MongoDB it runs sequentially and undoes completed steps if a later one fails. Indexes are built before the server starts (`ensureIndexes`).
- Run `npm run test:replset --prefix server` to execute the whole suite against a replica set (transaction path); `npm test` uses a standalone server (rollback path).

## Environment variables

### server/.env

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development`, `production` or `test` |
| `PORT` | no | `5001` | API port |
| `MONGO_URI` | yes | — | MongoDB connection string (use a replica set in production so check-out, payments and reversals run in real transactions) |
| `JWT_SECRET` | yes | — | HS256 secret for access tokens (32+ random characters in production) |
| `JWT_EXPIRES` | no | `15m` | Access-token lifetime (refresh tokens last 7 days and rotate) |
| `COOKIE_SECRET` | yes | — | Secret for signed cookies (must differ from `JWT_SECRET` in production) |
| `CLIENT_URL` | yes | — | The one browser origin allowed by CORS and the origin guard, and the base of links in emails |
| `CSRF_ENABLED` | no | `true` in production, else `false` | Double-submit CSRF: `X-CSRF-Token` must match the `csrfToken` cookie on non-GET `/api` requests |
| `TRUST_PROXY` | no | `0` | Reverse-proxy hops in front of the API (needed for correct rate limiting behind a load balancer) |
| `ATTACHMENT_ALLOWED_HOSTS` | no | empty | Hosts that complaint photo and expense receipt URLs may use (`files.example.com`, `*.cdn.example.com`). Empty accepts none. Swap point for signed-URL uploads |
| `EMAIL_ENABLED` | no | `true` | Set `false` to skip email entirely (in-app notifications still work) |
| `EMAIL_FROM` | no | `StayOS <no-reply@stayos.local>` | Sender address |
| `SMTP_URL` | no | — | e.g. `smtps://user:password@smtp.example.com:465`. Empty = emails are rendered as JSON and logged, never sent |
| `ENABLE_CRON` | no | `false` | Run the daily jobs inside the API process (see Notifications and jobs) |

### client/.env

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VITE_API_URL` | yes | — | API base URL, e.g. `http://localhost:5001/api` |

## Local development

```bash
npm run install:all
cp server/.env.example server/.env   # set secrets and MONGO_URI
cp client/.env.example client/.env
npm run seed --prefix server         # demo data (see "Seed data"); add -- --force to rebuild
npm run dev                          # API on :5001, client on :5173
npm test                             # server tests (in-memory MongoDB, standalone)
npm run test:replset --prefix server # same suite against a replica set (exercises real transactions)
npm run test:coverage --prefix server
npm run lint
```

Tests need no database: `mongodb-memory-server` downloads a MongoDB binary on first run.

## Seed data

`npm run seed --prefix server` builds a demo-ready database through the same services the API uses, so every number is consistent:

- Owner with one property, **Sunrise PG** (Bengaluru): 25 rooms, 100 beds.
- 2 wardens (one with no payment access, to show permission limits) and 3 maintenance staff, with per-property permissions.
- 33 residents: 30 in beds, 3 checked out (refunds pending approval). Charges for the last 3 months, a mix of full, partial and missing payments, overdue charges.
- 10 complaints in every status, 15 expenses, 3 student logins linked to residents.

It prints every credential (password for all demo accounts: `Demo@12345`; e.g. `owner@stayos.demo`, `warden1@stayos.demo`, `maint1@stayos.demo`, `student1@stayos.demo`). Re-running is safe: it does nothing if the demo data exists. `-- --force` removes only the demo property and the `*@stayos.demo` accounts, then recreates them. It refuses to run with `NODE_ENV=production` unless `--allow-production` is passed.

## Staff permissions

Owners hold every permission on properties they own. Staff (`warden`, `maintenance`) get a per-property list from the owner (`Property → Staff` tab, or `POST /api/properties/:id/staff/invite`, `GET/PATCH/DELETE .../staff[/:userId]`; revoking removes access but never deletes the account). Students are never invited through this route.

| Permission | Grants |
| --- | --- |
| `residents.view` | Read residents and stays |
| `residents.edit` | Create/update residents, check in, transfer, check out, invite a resident as a student |
| `payments.record` | `POST /api/payments` |
| `payments.view` | Charges, payments, receipts, refunds, resident balances |
| `complaints.manage` | Acknowledge, assign, close, staff reopen; complaint summary and assignee list |
| `finances.view` | Reports and expenses (read); `reports.view` unlocks reports only |
| `finances.edit` | Record and edit expenses |
| `settings.edit` | Rooms and beds (also satisfies the older `rooms:write` / `beds:write`) |

Defaults on invite: wardens get `residents.view, residents.edit, payments.record, payments.view, complaints.manage`; maintenance gets `complaints.manage, residents.view` (and only ever sees complaints assigned to them). Always owner-only: generating/adjusting/waiving charges, reversing or verifying payments, voiding expenses, approving or paying refunds, managing staff, announcements, running jobs. Grants stored by earlier phases (`payments:write`, `residents:write`, `stays:write`) are still honoured. Permissions are enforced by `requirePermission` on routes and again in the services; lists across several properties are narrowed to the properties where the caller holds the permission.

## Student portal

Students sign in with the account created by a resident invite and get `/student`: dashboard (room and bed, next rent due, outstanding, deposit held, latest notice), rent history with printable receipts, complaints, notifications and profile. The API is `/api/me/{summary,stay,charges,payments,receipts/:paymentId,refunds,complaints,notifications,profile}`. Everything is scoped by `Resident.userId`, never by an id the student supplies, and keeps working after check-out so history and the refund stay visible.

## Notifications and jobs

`notify(event, payload)` (`services/notification.service.js`) resolves recipients, creates one in-app row per recipient with a unique `dedupeKey` (`<event key>:<userId>`), and emails only newly created rows. A repeated event is a no-op. Failures are logged and never break the operation that raised the event. Recipients "owner and wardens with X" include the owner.

| Event | Raised by | Recipients |
| --- | --- | --- |
| `rent_due_soon` | rent reminder job (due within 3 days) | resident |
| `rent_overdue` | overdue reconcile (after payments and daily) | resident, owner, wardens with `payments.view` |
| `payment_recorded` | recording a payment | resident |
| `complaint_created` | student files a complaint | owner, wardens with `complaints.manage` |
| `task_assigned` | complaint assigned (again on re-assignment) | the assignee |
| `complaint_resolved` | complaint resolved | resident |
| `refund_pending` | check-out creates a refund awaiting approval | owner |
| `checkout_upcoming` / `checkin_upcoming` | upcoming-events job (within 3 days) | owner, wardens with `residents.edit` |
| `announcement` | `POST /api/properties/:id/announcements` | residents with a login |

Jobs live in `server/src/jobs/` (`rentReminders`, `overdueReconcile`, `upcomingEvents`). With `ENABLE_CRON=true` a built-in timer runs them daily at 02:00 IST (a plain timer, so no cron package; to use node-cron or an external scheduler, call `runJob(name)` from `jobs/index.js`). Run exactly one scheduler per deployment; duplicate runs are harmless because of dedupe. Owners can trigger a job by hand for the properties they own: `POST /api/admin/jobs/{rentReminders|overdueReconcile|upcomingEvents}`.

Email goes through `services/emailTransport.js` (nodemailer). Without `SMTP_URL` messages are logged as JSON; set `SMTP_URL` for real delivery. WhatsApp/SMS would plug in beside it in `notification.service.js`.

## Audit log

`auditLogs` is append-only (update and delete are refused). Each row has `user, property, action, entityType, entityId, before, after, meta, ip, userAgent, at`; ip and user agent come from the request context automatically. Covered: `payment.record|reverse|verify`, `charges.generate`, `charge.update|adjust|waive`, `stay.checkout`, `refund.approve|pay|cancel`, `expense.create|update|void`, `staff.invite|update|revoke`, `complaint.*`, `announcement.create`, `job.run`. Refused, invalid and preview-only requests write nothing. `logAudit(req, {...})` is the controller-side helper; services call `writeAudit` (in the same transaction where one exists).

## Security notes

- **Headers and origin:** helmet with a strict CSP (`default-src 'none'`, `script-src 'self'`, `frame-ancestors 'none'`); a request carrying an `Origin` other than `CLIENT_URL` is refused; CORS allows only that origin with credentials. Serve the client with its own CSP (scripts from `'self'`).
- **Sessions:** httpOnly, `SameSite=Lax` cookies (`Secure` in production), rotating refresh tokens, CSRF double-submit on by default in production.
- **Input:** Zod validation first; then a sanitiser drops `$`-prefixed and dotted keys and strips control characters from text (passwords and tokens are left exact).
- **Rate limits:** global on `/api`, tighter on `/api/auth/*` (login tighter still) and on `POST /api/payments`. Stores are in memory; use a shared store behind more than one instance.
- **Authorization coverage:** a test walks the router and fails if any route outside the public allow-list lacks `authenticate`; a role-by-endpoint matrix test asserts allowed and denied outcomes (wrong role, missing permission, other tenant, anonymous).
- **Money on the wire:** amounts are integer paise (`amountPaise`), never rupee floats; the server rejects floats and ignores nothing silently (unknown or computed fields are a 400).

## Rent (charges, payments, balances)

Three separate concepts, all in integer paise: **RentCharge** (owed), **Payment** (received), **Refund** (returned; model only, logic in Phase 5). The security deposit lives on the stay and is never part of rent due, paid or outstanding (`depositHeldPaise` is reported separately).

- `POST /api/rent-charges/generate` `{ propertyId | stayId, periodKey: 'YYYY-MM', dryRun? }` is idempotent (unique `{stay, periodKey}`; also one charge per resident per month across transfers). `POST /api/rent-charges/reconcile` flips charges to `overdue` once `today > dueDate + gracePeriodDays`; it also runs after every payment and is the hook for a later cron.
- `POST /api/payments` takes `idempotencyKey` (stored per property; a repeat returns the original with 200 and `replayed: true`), optional `allocations: [{ chargeId, amountPaise }]` (otherwise auto-allocated overdue-first, oldest first), `allowAdvance`, and `dryRun` (server-computed allocation and projected balance). Unknown fields such as `receiptNumber` or `status` are rejected with 400.
- Receipt numbers are `<PROPERTY_CODE>-<YYYYMM>-<seq>` from an atomic counter. Property codes are assigned on first payment.
- Payments are append-only. `POST /api/payments/:id/reverse` books a negative entry linked by `reversalOf` and reopens the charges; nothing is deleted. A payment is `recorded` until an owner calls `POST /api/payments/:id/verify`.
- A charge's `paidPaise` is a guarded cache of the payment ledger (concurrent payments cannot over-allocate); balances are computed from the ledger.
- Charge corrections: `PATCH /api/rent-charges/:id` (discount, due date, notes), `/adjust` (signed, logged), `/waive`.
- Wardens need the `payments:write` permission to record payments; reading charges/payments and balances needs owner or warden access to the property.

## Check-out and deposit refunds

- `POST /api/stays/:id/checkout/preview` (no side effects) and `POST /api/stays/:id/checkout` take the same body (`actualCheckOutDate`, `deductions`, `deductOutstandingRent`); commit adds `force`/`forceReason` (owner only), `approveRefundNow` (owner only) and `notes`. The server recomputes everything from the payment ledger; amounts in the body other than deductions are rejected.
- `refundable = deposit - documented deductions - outstanding rent netted against the deposit`. Netted rent is stored as a deduction line (`reason: 'outstanding rent'`, `system: true`); no payment is created or edited. Rent still owed beyond the deposit is recorded on the refund and stay snapshot, not turned into a new charge.
- Commit is atomic (transaction on a replica set, compensating rollback otherwise) and gated by one conditional update of the stay, so concurrent check-outs yield one success and 409s. It ends the stay, creates the refund (one per stay, even for 0), frees the bed only if it is `occupied`, marks the resident `former` unless they have another active stay, and waives (never deletes) future `pending` charges for that stay that no payment ever touched (adjustment reason `checkout`).
- Blocking issues (currently: rent owed and not being deducted) need `force` + a reason from an owner; the override is audited. Complaint-based blockers will plug into `buildPlan` once complaints exist.
- Refunds: `pending_approval -> approved -> paid`, or `pending_approval -> cancelled`, via `/api/refunds/:id/{approve,pay,cancel}` (owner). Every transition is a conditional update, so repeats are 409. Only `/pay` marks a refund paid.
- `auditLogs` is append-only (`stay.checkout`, `refund.approve|pay|cancel`).
- Students keep read-only access to their own charges, payments, receipts, balance and refunds after check-out; they never see other residents' records.

## Complaints / maintenance

- Students file via `POST /api/complaints` (`category`, `urgency`, `title`, `description`, optional `attachments: [{ url }]`); property, room, bed and stay are resolved server-side from their active stay, and unknown body fields are rejected. Numbers are `CMP-<PROPERTY_CODE>-<seq>` from an atomic counter.
- State machine (409 on anything else): `new -> acknowledged -> assigned -> in_progress -> resolved -> closed`, and `resolved|closed -> reopened -> in_progress`. Acknowledge/assign/close need owner or warden; progress/resolve need the assignee or an owner; `resolve` requires `resolutionNotes`. Re-assigning and extra progress notes add history entries without changing status. `statusHistory` is append-only and carries `fromStatus`, `by`, `at`, notes and photo URLs; response-time metrics should read it, not `updatedAt`. Each transition also writes an `auditLogs` row.
- Reopen: students (own complaint only) within 14 days of resolution and at most 3 times, via `POST /:id/reopen`; owners via the same POST and wardens via `PATCH /:id/reopen` without those limits. The SLA restarts from the reopen time.
- SLA is derived from urgency (high 1 day, medium 3, low 7); `slaState` is `ok | due_soon | overdue` (last quarter of the window counts as due soon). `overdueOnly=true` means unresolved and past `slaDueAt`.
- Visibility: students see only their own (a supplied `propertyId` is ignored), maintenance only complaints assigned to them, staff by property. Every complaint response includes `actions`, the transitions the current user may perform; the UI renders those rather than re-deriving rules.
- `GET /api/complaints/summary` returns `{ open (new, acknowledged, reopened), assigned, inProgress, resolvedToday, closed, overdue, byPriority }`.
- Attachments are URLs only: https, no credentials, host on `ATTACHMENT_ALLOWED_HOSTS` (comma-separated, `*.example.com` wildcards; empty accepts none). When uploads are built, issue signed URLs and add their host here; the schema and validators stay the same.

## Expenses and reports

- Expenses (`/api/expenses`, owner only for now): `paidAt` is the cash date and `periodKey` is derived from it (IST month). `DELETE` voids (`isVoided`) rather than deleting; voided rows are excluded from lists (unless `includeVoided=true`) and every report. Create/update/void are audited.
- Reports (`/api/reports/{overview,occupancy,collections,outstanding,expenses,trend,export}`, owner, or wardens holding `finances.view`/`reports.view`; `propertyId` required) are MongoDB aggregation pipelines over the payment ledger, charges, stays, beds and expenses; nothing is cached or hard-coded. All money is integer paise; percentages are rounded to 2 decimals. Each overview carries `definitions` (the text behind the dashboard's source tooltips).
- Accounting rules: **charged** = net due on charges with that `periodKey`; **collected** = payment allocations to those charges net of reversals, attributed to the charge's month, not the payment date; **outstanding** = net due - collected per charge (waived owe nothing). **Deposits are liabilities** and never enter charged, collected or cash: `deposits.heldPaise` = deposits on active stays + refunds approved/pending payout, with deposits received and refunds paid this month as informational lines. **Expenses** are cash-based (month of `paidAt`, `paymentStatus: paid`, not voided). `netCashPaise` = collected - expenses; it is a cash position, not profit, and mixes a charge-month figure with a cash-month figure by design.
- Occupancy series is rebuilt from stay check-in/check-out dates; bed totals are today's (beds keep no history), so older days approximate the denominator. Collections take the months overlapping `from`/`to`. Outstanding aging buckets are days past due date (not-yet-due counts as 0-15).
- Raw CSV exports also need the matching read permission (`payments.view` for charges/payments, `residents.view` for residents, `finances.view` for expenses), so `reports.view` alone cannot pull resident or payment rows.
- CSV export streams from a cursor with `Content-Disposition: attachment`; amounts are in paise (`*Paise` columns) and cells that could be read as spreadsheet formulas are prefixed with `'`.

## Tests

`npm test` runs 237 tests (Vitest + Supertest on mongodb-memory-server; `npm run test:replset` repeats them on a replica set). Coverage: `npm run test:coverage --prefix server`.

| Area | File |
| --- | --- |
| Auth, properties, stays, residents | `auth`, `properties`, `stays` |
| Rent, payments, idempotency, concurrent receipts | `payments` |
| Check-out, refunds, double check-out | `checkout` |
| Complaints and the state machine | `complaints` |
| Expenses, reports, CSV export, performance | `reports` |
| Export permissions, finance access, live access changes | `gaps` |
| Staff invitations and permission enforcement | `staff` |
| Notifications, dedupe, jobs | `notifications` |
| Student portal | `student` |
| Route authentication inventory, role matrix, isolation, hardening | `security` |
| Audit trail | `audit` |
| Full owner journey (register → property → beds → resident → rent → payment → check-out → refund) | `e2e` |
| Seed script | `seed` |

Concurrency is covered where it lives: bed double assignment (`stays`), duplicate payments and receipt numbers and double charge generation (`payments`), double check-out (`checkout`, `e2e`), duplicate notifications (`notifications`).

## Production checklist

- [ ] HTTPS everywhere; `NODE_ENV=production`; `TRUST_PROXY` set to the number of proxy hops.
- [ ] Strong, different `JWT_SECRET` and `COOKIE_SECRET` (the server refuses weak ones); cookies are `Secure` automatically.
- [ ] `CLIENT_URL` is the exact client origin; `CSRF_ENABLED` left at its production default (true).
- [ ] MongoDB as a **replica set** (transactions), with backups and point-in-time recovery; the unique indexes are built at start-up, so give the app permission to create indexes.
- [ ] `SMTP_URL` and `EMAIL_FROM` configured (or `EMAIL_ENABLED=false`); `ATTACHMENT_ALLOWED_HOSTS` set if photos or receipts are used.
- [ ] `ENABLE_CRON=true` on exactly one instance (or call the jobs from an external scheduler).
- [ ] Shared rate-limit store (e.g. Redis) if running several instances.
- [ ] Do not run the seed script against production data (it refuses without `--allow-production`).
- [ ] Ship logs somewhere durable; the audit log is in MongoDB, so back it up with the rest.

## Design system

The client follows Apple's Human Interface Guidelines principles (via the `apple-design` skill), adapted for the web.

- **Tokens:** every colour is a CSS variable in `client/src/index.css`, mapped into Tailwind in `client/tailwind.config.js`. Light and dark follow the system setting; there is no in-app switch. Text contrast is at least 4.5:1 in both (the numbers are in the CSS header comment).
- **One accent:** indigo is used only for primary actions, the selected nav item and links. Green, red, amber and blue are reserved for status.
- **Type:** the system font stack (SF on Apple devices), tabular figures for money, no embedded fonts.
- **Surfaces:** glass (blur) is used only on floating bars (top bar, student tab bar) and sheets, never behind content. It turns solid under reduced transparency; animations stop under reduced motion.
- **Navigation:** the owner and staff sidebar becomes a menu sheet below `md`. Students get a four-tab bottom bar on phones; notifications live in the bell.
- **Controls:** at least 32px on desktop and 44px on touch, a visible keyboard focus ring everywhere, and a press state on buttons.

## Known limitations and next steps

- **No payment gateway.** Payments are recorded by staff and verified by an owner; there is no online collection, settlement or reconciliation. A gateway would add a `verified` source and webhook handling in the payment service.
- **No WhatsApp/SMS.** Notifications are in-app plus email (JSON-logged until SMTP is configured).
- **Single owner per property, one property per staff account.** An email can belong to one account, so a person cannot yet be staff at several properties; there is no multi-property consolidated view (reports are per property).
- **Advances are recorded but not applied** to later charges; deposits are tracked on the stay and refund, not as a ledger of receipts.
- **No file uploads.** Photos and receipts are URLs on allow-listed hosts.
- **Occupancy history is derived** from stay dates against today's bed totals; there are no daily snapshots.
- **Planned:** payment gateway and settlement, WhatsApp/SMS, multi-property consolidation, native mobile apps, PDF receipts, SLA escalation emails.

### Packages added in the final phase

`nodemailer` (email transport with a JSON mode for development and an SMTP swap point) and the dev dependency `@vitest/coverage-v8` (coverage reporting). Everything else (sanitiser, scheduler, request context) is written in-house.
