# API Reference

Base URL: `http://localhost:4000/api`

## Conventions

Every response uses one of two envelopes.

**Success**

```json
{ "success": true, "data": {} }
```

Paginated collections add a `meta` block:

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 57, "totalPages": 3 }
}
```

Cursor-paginated collections (messages) use:

```json
{ "success": true, "data": [], "meta": { "nextCursor": "cmt3...", "hasMore": true, "limit": 50 } }
```

**Error**

```json
{
  "success": false,
  "message": "Conversation not found",
  "code": "CONVERSATION_NOT_FOUND",
  "requestId": "9a4a56b1-c294-432a-9cfe-d5620b0de8f5"
}
```

Clients branch on `code`, never on `message`. `requestId` correlates the
response with the server log line.

### Status codes

| Code | Meaning |
|---|---|
| 200 / 201 / 204 | Success |
| 400 | Malformed request the schema could not reject |
| 401 | Missing, expired or invalid token |
| 403 | Authenticated but lacking the required permission |
| 404 | Not found, or outside the caller's organization |
| 409 | Conflict (duplicate email, page already connected) |
| 422 | Failed schema validation; `details` lists the fields |
| 429 | Rate limited |
| 502 | A channel provider rejected the request |
| 503 | A channel is not configured or not built |

### Authentication

All routes except `/auth/login`, `/auth/register`, `/auth/refresh`, `/health/*`
and `/webhooks/*` require:

```http
Authorization: Bearer <accessToken>
```

`organizationId` is always taken from the token. Sending one in a request body
has no effect.

### Roles and permissions

| Permission | AGENT | MANAGER | ADMIN | SUPER_ADMIN |
|---|:-:|:-:|:-:|:-:|
| `conversation:read` (own, team, unassigned) | x | x | x | x |
| `conversation:read:all` | | x | x | x |
| `conversation:assign` | | x | x | x |
| `message:read`, `message:send` | x | x | x | x |
| `customer:create`, `customer:update` | x | x | x | x |
| `customer:delete` | | x | x | x |
| `tag:manage` | | x | x | x |
| `note:delete` (other people's) | | x | x | x |
| `user:create`, `user:update`, `user:delete` | | | x | x |
| `integration:manage` | | | x | x |
| `auditLog:read` | | | x | x |
| `organization:update`, `dev:tools` | | | | x |

---

## Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create an organization and its first SUPER_ADMIN |
| POST | `/auth/login` | Exchange credentials for tokens |
| POST | `/auth/refresh` | Rotate the refresh token |
| POST | `/auth/logout` | Revoke the current refresh token |
| GET | `/auth/me` | Current user, organization, teams and permissions |

```http
POST /api/auth/login
{ "email": "admin@demo.test", "password": "Password123!" }
```

---

## Customers

| Method | Path | Permission |
|---|---|---|
| GET | `/customers` | `customer:read` |
| GET | `/customers/:id` | `customer:read` |
| POST | `/customers` | `customer:create` |
| PATCH | `/customers/:id` | `customer:update` |
| DELETE | `/customers/:id` | `customer:delete` |
| POST | `/customers/:id/tags` | `customer:update` |
| DELETE | `/customers/:id/tags/:tagId` | `customer:update` |
| GET | `/customers/:id/channels` | `customer:read` |
| POST | `/customers/:id/channels` | `customer:update` |
| DELETE | `/customers/:id/channels/:channelId` | `customer:update` |
| GET | `/customers/:id/notes` | `note:read` |
| POST | `/customers/:id/notes` | `note:create` |

Query parameters for `GET /customers`: `page`, `limit`, `search` (name, email,
phone, company, channel username), `status`, `source`, `channel`, `tagIds`,
`assignedUserId`, `sort` (`recent` | `created` | `name`). The list filters
accept comma-separated values.

---

## Conversations

| Method | Path | Permission |
|---|---|---|
| GET | `/conversations` | `conversation:read` |
| GET | `/conversations/stats` | `conversation:read` |
| GET | `/conversations/:id` | `conversation:read` |
| POST | `/conversations` | `conversation:create` |
| PATCH | `/conversations/:id/status` | `conversation:update` |
| PATCH | `/conversations/:id/priority` | `conversation:update` |
| POST | `/conversations/:id/read` | `conversation:read` |
| POST | `/conversations/:id/assign` | `conversation:assign` |
| GET | `/conversations/:id/assignments` | `conversation:read` |
| POST | `/conversations/:id/tags` | `conversation:update` |
| DELETE | `/conversations/:id/tags/:tagId` | `conversation:update` |
| GET | `/conversations/:id/notes` | `note:read` |
| POST | `/conversations/:id/notes` | `note:create` |

Query parameters for `GET /conversations`: `page`, `limit`, `search` (customer
fields and message content), `status`, `channel`, `priority`, `assignedUserId`
(an id, `me`, or `unassigned`), `assignedTeamId`, `customerId`, `tagIds`,
`unreadOnly`, `sort` (`recent` | `oldest` | `priority`).

**Row-level visibility.** Without `conversation:read:all` a caller sees only
conversations assigned to them, assigned to one of their teams, or unassigned.
Everything else answers `404`.

```http
POST /api/conversations/:id/assign
{ "assignedUserId": "cmt3...", "assignedTeamId": null }
```

`null` clears that dimension; omitting a field leaves it unchanged. Each change
closes the open row in `ConversationAssignment` and opens a new one, so the full
custody chain is queryable through `GET /conversations/:id/assignments`.

---

## Messages

| Method | Path | Permission |
|---|---|---|
| GET | `/conversations/:id/messages` | `message:read` |
| POST | `/conversations/:id/messages` | `message:send` |

`GET` is cursor-paginated (`cursor`, `limit`, `includeInternal`) and returns the
newest page in reading order. Follow `meta.nextCursor` for older history.

```http
POST /api/conversations/:id/messages
{ "content": "Hello, how can I help you?" }
```

An internal note is stored in the thread and never delivered to the customer:

```http
POST /api/conversations/:id/messages
{ "content": "Wants the premium plan. Follow up tomorrow.", "isInternal": true }
```

The send path checks access, channel binding and credentials *before* writing
anything. It then stores the message as `PENDING`, calls the provider, and marks
it `SENT` or `FAILED` — a provider outage leaves a visible failed message rather
than a silently dropped reply. The frontend never calls Meta directly.

---

## Integrations

| Method | Path | Permission |
|---|---|---|
| GET | `/integrations` | `integration:read` |
| GET | `/integrations/catalogue` | `integration:read` |
| GET | `/integrations/:id` | `integration:read` |
| POST | `/integrations/facebook` | `integration:manage` |
| PATCH | `/integrations/:id` | `integration:manage` |
| DELETE | `/integrations/:id` | `integration:manage` |

`/integrations/catalogue` returns every channel the product knows about with
`available` (a provider exists in this build) and `configured` (process-level
credentials are present). That is what the settings screen renders, including
channels that are not built yet.

```http
POST /api/integrations/facebook
{ "name": "My Company", "pageId": "123456789", "pageAccessToken": "EAA..." }
```

Access tokens are encrypted on write and are never returned; responses expose
only `hasCredentials: boolean`. `DELETE` disconnects and destroys the token but
keeps the row, so conversation history survives a reconnect.

---

## Tags, notes, notifications

| Method | Path | Permission |
|---|---|---|
| GET | `/tags` | `tag:read` |
| POST, PATCH, DELETE | `/tags`, `/tags/:id` | `tag:manage` |
| DELETE | `/notes/:id` | author, or `note:delete` |
| GET | `/notifications` | authenticated (own only) |
| GET | `/notifications/unread-count` | authenticated |
| PATCH | `/notifications/:id/read` | authenticated |
| POST | `/notifications/read-all` | authenticated |

Tag names are normalised to upper snake case, so `hot lead`, `Hot Lead` and
`HOT_LEAD` collapse to one tag.

---

## Webhooks

| Method | Path | Description |
|---|---|---|
| GET | `/webhooks/facebook` | Meta verification handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`) |
| POST | `/webhooks/facebook` | Inbound Messenger events |

Unauthenticated by design; `POST` is authenticated by Meta's
`X-Hub-Signature-256` HMAC over the raw body, compared in constant time. A
missing or unverifiable signature answers `401` and the body is never parsed.

The route acknowledges with `200` *before* processing. Meta retries anything it
does not see acknowledged within seconds, so doing the database work first turns
one slow query into a redelivery storm. Every delivery is recorded in
`WebhookEvent` — raw payload, status and error — so "did Meta send it, and what
did we do with it" is answerable without provider support.

Messages are deduplicated on `externalMessageId`, and each one in a batch is
processed independently: a single malformed entry does not cost the other nine,
because Meta will not resend the batch.

A delivery for a Page no workspace has connected is acknowledged and dropped —
refusing it would make Meta retry something that can never succeed.

These routes are mounted ahead of the global rate limiter and carry their own
generous one: provider traffic is bursty and already authenticated per delivery,
so sharing an agent-sized budget with it would drop real customer messages.

---

## Analytics

| Method | Path | Permission |
|---|---|---|
| GET | `/analytics/overview` | `conversation:read:all` |

Query parameters: `days` (1–365, default 30) and `channel` (comma separated).

Returns headline totals, a zero-filled daily volume series, first-response and
resolution times (average and median, with the count of answered conversations
so the average cannot be read as covering everything), per-channel, per-status
and per-priority splits, agent activity and the top tags.

Requires workspace-wide visibility rather than plain `conversation:read`: an
aggregate over the subset one agent is assigned looks authoritative but
describes a slice.

---

## Development mode

| Method | Path |
|---|---|
| POST | `/dev/simulate/inbound-message` |
| POST | `/dev/simulate/seed` |
| POST | `/dev/simulate/reset` |

Requires `ENABLE_DEV_TOOLS=true` and the `dev:tools` permission; otherwise `404`.
These run the same ingest path a real webhook uses.
