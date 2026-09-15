# Omnichannel CRM Portal

A multi-tenant CRM that centralises customer conversations from Facebook
Messenger, Instagram, email, website chat and WhatsApp into a single inbox.

Facebook Messenger and Instagram Direct are implemented. Every other channel
plugs into the same conversation system through a provider interface, so adding
one is a new file rather than a schema change — Instagram went in exactly that
way, and the conversation system did not move.

Both Meta channels share one app, one login and one set of credentials. See
[docs/META_SETUP.md](docs/META_SETUP.md) to connect them.

---

## Architecture

```text
Channel (Facebook, Instagram, Email, Website, WhatsApp)
        |
        v
Provider adapter          implements MessagingProvider
        |
        v
NormalizedMessage         provider-agnostic struct
        |
        v
Conversation ingest       resolves tenant, customer, identity, thread
        |
        v
PostgreSQL (Prisma)
        |
        v
Socket.IO  ---->  Next.js CRM
```

The rule the codebase enforces: **nothing above the ingest layer knows which
channel a message came from.** A provider translates its own wire format into
`NormalizedMessage` and never touches the database, the tenant, or the threading
rules.

### Repository layout

```text
crm-portal/
├── backend/
│   ├── src/
│   │   ├── channels/          provider contract + registry (the abstraction)
│   │   │   ├── meta/          OAuth, webhook auth and wire types shared by
│   │   │   │                  Messenger and Instagram
│   │   │   ├── facebook/      Messenger provider
│   │   │   └── instagram/     Instagram Direct provider
│   │   ├── config/            env validation, logger, permissions
│   │   ├── database/          Prisma and Redis clients
│   │   ├── middleware/        auth, RBAC, validation, errors, rate limiting
│   │   ├── modules/           one folder per domain (see below)
│   │   ├── realtime/          Socket.IO server, rooms and emit helpers
│   │   ├── routes/            single API mount point
│   │   ├── utils/             errors, crypto, jwt, pagination, responses
│   │   ├── app.ts
│   │   └── server.ts
│   ├── prisma/                schema, migrations, seed
│   └── tests/                 unit + integration suites
├── frontend/
│   ├── app/                   Next.js 16 App Router
│   │   ├── login/
│   │   └── (app)/             everything behind the auth gate
│   │       ├── inbox/         list in the layout, thread in [id]
│   │       ├── customers/
│   │       ├── analytics/
│   │       └── settings/      integrations, team, tags, audit, account
│   ├── components/            ui primitives, app shell, inbox, analytics
│   └── lib/                   api client, auth, socket, hooks, types
├── docker-compose.yml
├── .env.example
└── README.md
```

Backend modules: `auth`, `users`, `organizations`, `teams`, `integrations`,
`customers`, `customer-channels`, `conversations`, `messages`, `assignments`,
`tags`, `notes`, `notifications`, `audit-logs`, `analytics`, `webhooks`,
`dev-tools`.

---

## Quick start

### 1. Clone and install

```bash
git clone <repository-url>
cd "omni crm"

cd backend  && pnpm install && cd ..
cd frontend && pnpm install && cd ..
```

### 2. Configure environment

There are two env files, and they are not interchangeable:

```bash
cp .env.example .env                  # docker compose (ports, credentials)
cp backend/.env.example backend/.env  # the API process
```

Generate the two JWT secrets and the token-encryption key:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

Paste the three values into `backend/.env` (and into `.env` if you run the
backend through compose).

`ENCRYPTION_KEY` must be exactly 64 hex characters — it is the AES-256-GCM key
that protects provider access tokens at rest. The API refuses to start if any
required variable is missing or malformed.

### 3. Start PostgreSQL and Redis

```bash
docker compose up -d postgres redis
```

### 4. Migrate and seed

```bash
cd backend
pnpm prisma:deploy    # apply migrations
pnpm db:seed          # demo organization, users, teams, conversations
```

### 5. Run

```bash
cd backend  && pnpm dev     # http://localhost:4000
cd frontend && pnpm dev     # http://localhost:3000
```

### Demo accounts

| Email | Password | Role |
|---|---|---|
| `admin@demo.test` | `Password123!` | SUPER_ADMIN |
| `manager@demo.test` | `Password123!` | MANAGER |
| `rahul@demo.test` | `Password123!` | AGENT |
| `karan@demo.test` | `Password123!` | AGENT |

The seed makes the UI usable immediately — no Facebook connection required.

---

## Docker

Run the whole stack:

```bash
docker compose up -d          # postgres, redis, backend, frontend
docker compose logs -f        # follow logs
docker compose logs -f backend
docker compose down           # stop
docker compose down -v        # stop and drop the data volumes
```

The backend container applies migrations on boot, so a fresh `up` produces a
working database with no manual step. Only `postgres` and `redis` are needed for
local development against `pnpm dev`.

Ports default to frontend `3000`, backend `4000`, Postgres `5432`, Redis `6379`,
each overridable in `.env` via `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`
and `REDIS_PORT`.

If you change a database port, `backend/.env` must agree: `DATABASE_URL` and
`REDIS_URL` are read by the API process directly and are not derived from the
compose variables. For example, with `POSTGRES_PORT=55432` and `REDIS_PORT=6380`:

```env
DATABASE_URL=postgresql://omni:omni_local_password@localhost:55432/omni_crm?schema=public
REDIS_URL=redis://localhost:6380
```

---

## Testing

```bash
cd backend
pnpm test               # everything
pnpm test:unit          # pure unit tests
pnpm test:integration   # against a real Postgres
```

Integration tests create and migrate a separate `omni_crm_test` database in the
same Postgres container, and refuse to run against a database whose name does
not contain `test`. State is reset between tests by deleting organizations,
which cascades to every tenant-scoped table.

On Docker Desktop the published Postgres port is reached through a virtualised
proxy that is slow to open sockets, so the test client uses longer connection
and transaction timeouts than production. If you see
`Unable to start a transaction in the given time`, the container is under load
rather than the code being wrong.

Covered: login and token issuance, RBAC, cross-tenant isolation, customer CRUD,
conversation lifecycle, message creation and cursor pagination, assignment
history, and webhook idempotency including the concurrent-delivery race.

---

## Development mode

Before Facebook is connected, the inbox can be driven with simulated traffic.
These endpoints run the **same ingest path** a real webhook uses, so there is no
second code path to keep in sync.

```bash
POST /api/dev/simulate/inbound-message   # one inbound message
POST /api/dev/simulate/seed              # a set of realistic conversations
POST /api/dev/simulate/reset             # remove everything simulated
```

Two independent gates guard them: `ENABLE_DEV_TOOLS` (which env validation
forces to `false` when `NODE_ENV=production`) and the `dev:tools` permission.
When disabled the routes answer `404`, so production does not advertise them.

Simulated integrations carry no access token, so an attempt to *send* through
one fails with a clear configuration error rather than pretending it reached
Facebook.

---

## Connecting Facebook

Three process-level values must be present before a Page can be connected. The
API boots without them and reports the channel as unconfigured rather than
failing at the first message:

```env
META_APP_ID=...
META_APP_SECRET=...
META_WEBHOOK_VERIFY_TOKEN=<any string you choose>
```

In the Meta app dashboard, add a Messenger webhook pointing at:

```text
https://<your-api-host>/api/webhooks/facebook
```

using the same verify token, and subscribe to the `messages` and
`messaging_postbacks` fields. `GET` answers the handshake; `POST` receives
deliveries.

Then open **Settings → Integrations** in the CRM and connect the Page with its
Page ID and a long-lived Page access token. The token is AES-256-GCM encrypted
before it is stored and is never returned by any endpoint — responses expose
only `hasCredentials`.

Locally, Meta needs a public URL. Point a tunnel at port 4000 and use the
tunnel's hostname as the callback.

**Echoes.** Meta echoes every message a Page sends, including the ones this API
just sent through the Send API. Those are dropped by matching `app_id` against
`META_APP_ID`, because the row already exists. An echo *without* an app id is a
human replying from Meta Business Suite, and that one is kept — otherwise the
CRM transcript would silently diverge from what the customer actually saw.

---

## Real time

Socket.IO attaches to the same HTTP server as the API and authenticates the
handshake with the same access token, verified by the same code path — a
deactivated user is refused on the socket exactly as on a request.

Rooms are prefixed with the organization id and a socket is only ever joined to
rooms built from its own verified token, so a payload cannot cross tenants even
if a room name is guessed. Joining a conversation room re-checks the same
row-level visibility rule the REST API applies.

| Event | Direction | Payload |
|---|---|---|
| `message:created` | server → client | the message plus its conversation |
| `message:updated` | server → client | delivery and read receipts |
| `conversation:created` / `conversation:updated` | server → client | the conversation and what changed |
| `notification:created` | server → client | one notification, to that user's room |
| `conversation:typing` | server → client | who is typing in a thread |
| `presence:updated` | server → client | an agent connected or disconnected |
| `conversation:join` / `conversation:leave` | client → server | subscribe to a thread |
| `typing:start` / `typing:stop` | client → server | typing in a thread |

Broadcasts happen at one place per kind of change. Inbound messages emit from
the ingest path itself, so a real webhook and the dev simulator can never
diverge; notifications emit from `createNotification`, so a notification cannot
be written without being delivered.

With `REDIS_URL` set, the Socket.IO Redis adapter carries events between API
instances. Without it the server runs single-node, which is fine locally and
wrong in production — a message ingested on one instance would never reach an
agent connected to another.

---

## Analytics

`GET /api/analytics/overview?days=30` powers the analytics screen: volume over
time, first-response and resolution times, per-channel and per-status splits,
agent activity and tag usage.

It requires `conversation:read:all`, so it is a manager-and-above view. That is
deliberate — an aggregate over the slice of conversations one agent happens to
be assigned looks authoritative but describes almost nothing, and mixing scoped
and unscoped numbers on one screen invites the wrong conclusion.

---

## Security

- Argon2-grade password hashing (bcrypt cost 12), never returned in a response.
- Short-lived JWT access tokens plus rotating refresh tokens with reuse detection.
- Permission-based authorization checked on the **backend** for every route.
- `organizationId` is always derived from the verified token, never from the
  request body, query or a header.
- Cross-tenant reads answer `404`, not `403`, so an id's existence is not
  disclosed.
- Provider access tokens are AES-256-GCM encrypted at rest and are excluded from
  every API select. One function decrypts them, only to hand to a provider.
- Helmet security headers, strict CORS allow-list, and Redis-backed rate limiting.
- Meta webhook deliveries are signature-verified before they are parsed.
- Secrets are never logged.

---

## Implementation phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Project setup, Prisma schema, Docker, auth, organizations, users, teams | Complete |
| 2 | Customers, channel identities, conversations, messages, assignments, tags, notes | Complete |
| 3 | Next.js dashboard, inbox, chat UI, customer sidebar | Complete |
| 4 | Socket.IO, real-time messages, notifications, typing | Complete |
| 5 | Facebook integration, webhooks, incoming and outgoing messages | Complete |
| 6 | Real Facebook data wired into the inbox | Complete |
| 7 | Search, filters, analytics, audit log UI | Complete |

See [`docs/API.md`](docs/API.md) for the endpoint reference.
