# Database Design

PostgreSQL via Prisma. Every tenant-scoped table carries `organizationId`, and
every query in the codebase filters on it using the value from the verified JWT.

## Entity relationships

```text
Organization
├── User ──────────────┬── UserTeam ── Team
│                      ├── Message (sender)
│                      ├── Note (author)
│                      ├── Notification
│                      └── AuditLog
│
├── Team ──────────────┬── UserTeam
│                      └── Conversation (assignedTeam)
│
├── Integration ───────┬── CustomerChannel
│                      ├── Conversation
│                      └── WebhookEvent
│
├── Customer ──────────┬── CustomerChannel ── Conversation
│                      ├── CustomerTag ── Tag
│                      ├── Note
│                      └── Conversation
│
├── Conversation ──────┬── Message ── MessageAttachment
│                      ├── ConversationAssignment
│                      ├── ConversationTag ── Tag
│                      ├── Note
│                      └── Notification
│
├── Tag ───────────────┬── CustomerTag
│                      └── ConversationTag
│
└── AuditLog
```

## The three decisions that make this channel-agnostic

**1. `Integration` is generic, not Facebook-shaped.**

```prisma
type              IntegrationType   // FACEBOOK | INSTAGRAM | EMAIL | WEBSITE | WHATSAPP
externalAccountId String?           // Meta business id, mailbox owner, ...
externalPageId    String?           // Page id, IG business account, mailbox address
accessToken       String?           // AES-256-GCM ciphertext
metadata          Json?             // non-secret provider details
@@unique([type, externalPageId])
```

There is no `pageId` column and no `metaAppId` column. Adding WhatsApp adds an
enum value, not a migration of the conversation system.

The unique index on `(type, externalPageId)` is load-bearing: one provider inbox
belongs to exactly one organization, so an inbound webhook resolves to exactly
one tenant and can never be attributed to the wrong one.

**2. `CustomerChannel` separates a person from their identities.**

One `Customer` may hold a Messenger PSID, an Instagram-scoped id and an email
address at once, so the Facebook thread and the email thread show the same
person.

```prisma
@@unique([integrationId, externalUserId])
```

This is the sole mechanism for "have we seen this person before" — no name or
email heuristics. It also means two webhooks arriving at the same instant cannot
create two customers for one PSID: the second insert loses on the index.

**3. `Message.externalMessageId` is globally unique.**

```prisma
externalMessageId String? @unique
```

Meta retries webhook deliveries aggressively. Ingest pre-checks this column and
also catches the `P2002` violation, so a redelivery — even one racing its twin —
is a no-op instead of a duplicate message in the thread.

## Conversation threading

An inbound message reuses the `OPEN` or `PENDING` conversation for that identity.
If the last one is `CLOSED`, a new conversation is opened rather than reopening
the old one, so a resolved ticket stays resolved and time-to-close keeps its
meaning.

`Conversation` denormalises `assignedUserId` and `assignedTeamId` for fast
inbox queries; `ConversationAssignment` holds the full custody chain. Each
change closes the open period (`unassignedAt`) and opens a new one in the same
transaction, so the two can never disagree:

```text
Conversation
  └─ assigned to Rahul   (assignedAt 09:12, unassignedAt 11:40)
  └─ assigned to Karan   (assignedAt 11:40, unassignedAt null)   <- current
```

`unreadCount`, `lastMessageAt` and `lastCustomerMessageAt` are maintained on
write so the inbox list needs no aggregate query.

## Indexes

Chosen for the queries the inbox actually issues:

| Table | Index | Serves |
|---|---|---|
| `conversations` | `(organizationId, status, lastMessageAt)` | default inbox list |
| `conversations` | `(organizationId, assignedUserId)` | "assigned to me" |
| `conversations` | `(customerChannelId, status)` | ingest thread lookup |
| `messages` | `(conversationId, createdAt)` | cursor-paginated history |
| `messages` | `externalMessageId` unique | webhook idempotency |
| `customer_channels` | `(integrationId, externalUserId)` unique | identity resolution |
| `integrations` | `(type, externalPageId)` unique | webhook to tenant |
| `notifications` | `(userId, isRead, createdAt)` | unread badge |

## Cascade behaviour

Deleting an `Organization` removes everything beneath it. Deleting a `Customer`
cascades to their channels, conversations and messages. Deleting a `User`
**nulls** rather than deletes: their sent messages and past assignments survive,
because history should not disappear when someone leaves.

Disconnecting an `Integration` keeps the row and destroys the token, so
conversation history survives a reconnect.
