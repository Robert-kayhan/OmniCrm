# Connecting Facebook Messenger

This guide takes you from no Meta app to a working **Connect with Facebook**
button that pulls a Page's conversations into the inbox.

The code is already written. Everything below is configuration you do in the
Meta dashboard and in your `.env` files — there is nothing left to build.

---

## What the button actually does

When an operator clicks **Connect with Facebook** in Settings → Integrations:

1. The API returns Meta's login URL and the browser navigates to it.
2. The operator approves the app and picks which Pages to grant.
3. Meta redirects back to `/api/integrations/facebook/oauth/callback` with a
   one-time `code`.
4. The API exchanges that code for a user token, extends it to ~60 days, and
   reads the Pages the operator administers.
5. The operator picks a Page from a dialog.
6. The API subscribes that Page to this app's webhook, stores its encrypted
   Page token, and imports the 50 most recent conversations
   (50 messages each).

From then on, new messages arrive over the webhook in real time.

Page access tokens never reach the browser. They are held encrypted for the ten
minutes between steps 4 and 5, then encrypted at rest in the `Integration`
table.

---

## Before you start

You need three things:

| Requirement | Why |
|---|---|
| A Facebook **Page** | Messenger conversations belong to a Page, not a person. |
| A **Meta developer account** | https://developers.facebook.com — free. |
| A **public HTTPS URL** | Meta cannot call `localhost`. A tunnel for local work (step 2), or [your own domain](#using-a-custom-domain-for-the-backend) for a real deployment. |

---

## Step 1 — Create the Meta app

1. Go to https://developers.facebook.com/apps → **Create app**.
2. For "What do you want your app to do?", choose **Other**.
3. App type: **Business**.
4. Name it (for example `Omni CRM`) and create it.
5. Open **App settings → Basic**. Copy the **App ID** and **App Secret**.

Put them in `backend/.env`:

```bash
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
```

Also invent a webhook verify token — any random string you choose, used once in
step 4:

```bash
META_WEBHOOK_VERIFY_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
```

---

## Step 2 — Give the API a public HTTPS URL

Meta must be able to reach your API from the internet, both for the OAuth
redirect and for webhook deliveries. Meta requires **HTTPS** for both; plain
`http://` is rejected, and `localhost` is unreachable either way.

**Deploying on your own domain?** Skip to
[Using a custom domain for the backend](#using-a-custom-domain-for-the-backend)
and come back here for step 3. The rest of this step is the local tunnel.

```bash
# Either
ngrok http 4000

# or
cloudflared tunnel --url http://localhost:4000
```

Copy the HTTPS URL it prints (for example
`https://a1b2c3d4.ngrok-free.app`) and set both of these in `backend/.env`:

```bash
BACKEND_URL=https://a1b2c3d4.ngrok-free.app
META_OAUTH_REDIRECT_URI=https://a1b2c3d4.ngrok-free.app/api/integrations/facebook/oauth/callback
```

> The tunnel URL changes every time you restart ngrok on the free plan. When it
> changes you must update `backend/.env` **and** the two dashboard fields in
> steps 3 and 4, or the login breaks with `URL Blocked`.

In production, `BACKEND_URL` is your real API host and
`META_OAUTH_REDIRECT_URI` can be left unset — it defaults to
`${BACKEND_URL}/api/integrations/facebook/oauth/callback`. See the custom
domain section below for the full list of variables that change.

---

## Using a custom domain for the backend

Replaces the tunnel in step 2. The worked example uses:

| Role | Host |
|---|---|
| API | `api.yourdomain.com` |
| CRM | `app.yourdomain.com` |

Substitute your own throughout. Both must be HTTPS — Meta rejects `http://`
for OAuth redirects and for webhooks.

### 1. Point DNS at your server

Create one record per host:

| Type | Name | Value |
|---|---|---|
| `A` | `api` | your server's IPv4 |
| `A` | `app` | your server's IPv4 |

Use `CNAME` instead if your host gives you a hostname rather than an IP. Wait
for propagation, then confirm:

```bash
dig +short api.yourdomain.com
```

### 2. Terminate TLS in front of the API

The API speaks plain HTTP on port 4000. Put a reverse proxy in front of it to
handle the certificate. **Caddy** is the shortest path — it obtains and renews
a Let's Encrypt certificate on its own:

```caddyfile
# /etc/caddy/Caddyfile
api.yourdomain.com {
    reverse_proxy localhost:4000
}

app.yourdomain.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

That is the whole configuration. Caddy forwards `X-Forwarded-For` and
`X-Forwarded-Proto` by default and proxies WebSocket upgrades without extra
directives, which the realtime inbox needs.

<details>
<summary>nginx equivalent, if you already run nginx</summary>

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Socket.IO lives at /socket.io and needs the upgrade headers, or the
        # inbox silently falls back to polling and live updates lag.
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_http_version 1.1;

        proxy_read_timeout 300s;
    }
}
```

Get the certificate with `sudo certbot --nginx -d api.yourdomain.com`.

Do not add any module that rewrites or re-encodes request bodies. Meta signs
the **exact bytes** it sends, and the webhook verifier recomputes that HMAC
over the raw body — altering it by even one byte makes every delivery look
forged and get rejected.

</details>

### 3. Set the environment variables

In `backend/.env`:

```bash
NODE_ENV=production

# The public origins. BACKEND_URL is what the default OAuth redirect is
# derived from, and FRONTEND_URL is where the OAuth callback sends the
# browser back to — and is always an allowed CORS origin.
BACKEND_URL=https://api.yourdomain.com
FRONTEND_URL=https://app.yourdomain.com

# Optional: only needed if something other than FRONTEND_URL calls the API.
CORS_ORIGINS=

# One reverse proxy in front of the API. Without this, express sees the
# proxy's IP for every request, so rate limiting buckets the whole internet
# together and the login limiter locks everyone out at once.
TRUST_PROXY_HOPS=1

# HTTPS, so cookies can be Secure. The auth cookies switch to
# SameSite=None at the same time, which is what lets app.yourdomain.com
# talk to api.yourdomain.com.
COOKIE_SECURE=true

# Only when the CRM and API are subdomains of one parent and you want the
# session shared across them. Leave unset otherwise.
# COOKIE_DOMAIN=.yourdomain.com

# Required in production — startup refuses without it.
REDIS_URL=redis://localhost:6379

# Must be false in production; startup refuses otherwise.
ENABLE_DEV_TOOLS=false
```

`META_OAUTH_REDIRECT_URI` can stay unset. It defaults to
`${BACKEND_URL}/api/integrations/facebook/oauth/callback`, which is already
`https://api.yourdomain.com/api/integrations/facebook/oauth/callback`.

Set it explicitly only when the API cannot derive its own public address —
for example when it sits behind a path-rewriting gateway, or is served under a
sub-path rather than at the domain root.

### 4. Rebuild the frontend

`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` are **baked into the
JavaScript bundle at build time**, not read at runtime. Changing them in `.env`
and restarting does nothing — the browser keeps calling the old host.

In the root `.env` (the one compose reads):

```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_SOCKET_URL=https://api.yourdomain.com
```

Then rebuild:

```bash
docker compose build frontend && docker compose up -d frontend
```

Running the frontend directly instead of via compose:

```bash
cd frontend && pnpm build && pnpm start
```

### 5. Update the Meta dashboard

Three places, all of which must use the new domain:

| Where | Field | Value |
|---|---|---|
| App settings → Basic | **App Domains** | `yourdomain.com` |
| Facebook Login → Settings | **Valid OAuth Redirect URIs** | `https://api.yourdomain.com/api/integrations/facebook/oauth/callback` |
| Messenger → Settings → Webhooks | **Callback URL** | `https://api.yourdomain.com/api/webhooks/facebook` |

Also set **Privacy Policy URL** and **Terms of Service URL** under
App settings → Basic. Meta requires both before an app can leave Development
mode.

Remove the old ngrok entries once the new ones work, so a stale tunnel URL
cannot accept a login.

### 6. Verify

```bash
# TLS is valid and the API is reachable
curl -s https://api.yourdomain.com/api/health | jq

# The webhook handshake answers on the new domain. Substitute your
# META_WEBHOOK_VERIFY_TOKEN; it should echo 12345 back.
curl -s "https://api.yourdomain.com/api/webhooks/facebook\
?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=12345"

# The authorize URL now carries the custom domain as redirect_uri
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.yourdomain.com/api/integrations/facebook/oauth/start | jq -r .data.authorizeUrl
```

The last command's `redirect_uri` parameter must match the dashboard entry from
step 5 exactly. If it does not, the login fails with `URL Blocked`.

### Running it all through docker compose

`docker-compose.yml` already passes `BACKEND_URL`, `FRONTEND_URL`,
`CORS_ORIGINS`, `TRUST_PROXY_HOPS`, `COOKIE_SECURE`, `META_OAUTH_REDIRECT_URI`
and `META_OAUTH_SCOPES` through from the root `.env`, so setting them there is
enough for the API.

Two caveats:

- The frontend's `NEXT_PUBLIC_*` values are build args. Changing them requires
  `docker compose build frontend`, not just a restart.
- The published ports (`4000`, `3000`) are what your reverse proxy points at.
  If the proxy runs on the same host, consider binding them to loopback —
  `BACKEND_PORT=127.0.0.1:4000` — so the API is not also reachable on plain
  HTTP from outside.

---

## Step 3 — Add Facebook Login

1. In the app dashboard: **Add product** → **Facebook Login** → **Set up**.
2. Go to **Facebook Login → Settings**.
3. Under **Valid OAuth Redirect URIs**, paste your callback URL **exactly** as
   it appears in `META_OAUTH_REDIRECT_URI`:

   ```
   https://a1b2c3d4.ngrok-free.app/api/integrations/facebook/oauth/callback
   ```

4. Leave **Client OAuth Login** and **Web OAuth Login** enabled.
5. Save.

On a custom domain this is
`https://api.yourdomain.com/api/integrations/facebook/oauth/callback` instead.

A trailing slash, `http` instead of `https`, or a different subdomain all count
as a different URI and produce `URL Blocked`.

---

## Step 4 — Add Messenger and point the webhook at your API

1. **Add product** → **Messenger** → **Set up**.
2. Go to **Messenger → Settings → Webhooks** → **Add callback URL**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Callback URL | `https://a1b2c3d4.ngrok-free.app/api/webhooks/facebook` |
   | Verify token | the `META_WEBHOOK_VERIFY_TOKEN` you generated in step 1 |

   On a custom domain the callback URL is
   `https://api.yourdomain.com/api/webhooks/facebook`.

4. Click **Verify and save**. The API must be running and publicly reachable —
   Meta calls it immediately with a `GET` handshake.
5. Under **Webhook fields**, subscribe to at least:

   - `messages`
   - `messaging_postbacks`
   - `message_deliveries`
   - `message_reads`

Do **not** subscribe the Page here by hand. The Connect button does that itself
via `pages_manage_metadata`, so the Page is subscribed to the right app
automatically.

---

## Step 5 — Restart the API and connect

```bash
cd backend && pnpm dev
```

Then in the CRM: **Settings → Integrations → Connect with Facebook**.

You should see Meta's login, then a dialog listing your Pages, then a toast
reporting how many messages were imported.

---

## While the app is in Development mode

A new Meta app starts in **Development** mode. This is the normal place to be
while you are building, and it works — but only for people with a role on the
app.

To let a colleague connect their Page, add them under
**App roles → Roles** as an Administrator, Developer or Tester. Anyone else
sees an error at login.

Going live for the general public requires **App Review** for
`pages_messaging`, `pages_show_list`, `pages_read_engagement` and
`pages_manage_metadata`. That is a Meta process with a demo video and a
business verification; it has nothing to do with this codebase.

---

## Troubleshooting

**`URL Blocked` at login**
The redirect URI in `META_OAUTH_REDIRECT_URI` does not byte-for-byte match a
Valid OAuth Redirect URI in step 3. Compare scheme, host and path.

**The connect succeeds but no new messages arrive**
The Page is not subscribed to your app. Check the API logs for
`page webhook subscription`, and confirm your token had
`pages_manage_metadata`. Reconnecting the Page retries the subscription.

**The webhook handshake fails in step 4**
`META_WEBHOOK_VERIFY_TOKEN` in the running API does not match what you typed in
the dashboard. Note that the API reads env once at boot — restart it after
editing `backend/.env`.

**"That Facebook account does not administer any Pages"**
The logged-in person has no Page admin role. Check
https://www.facebook.com/pages/?category=your_pages.

**History imported but names show as "Unknown"**
Meta withholds profile details until the person has messaged the Page and the
app holds the right permission. The names fill in as people write in.

**Everyone gets rate-limited at once after moving to a domain**
`TRUST_PROXY_HOPS` is still `0`, so every request appears to come from the
reverse proxy's IP and shares one rate-limit bucket. Set it to the number of
proxies in front of the API — `1` for a single nginx or Caddy.

**Login works, then the CRM immediately logs you out**
The auth cookie is being dropped. On HTTPS you need `COOKIE_SECURE=true`; the
cookies then switch to `SameSite=None`, which is what allows the CRM origin to
send them to the API origin. If the two are subdomains of one parent, setting
`COOKIE_DOMAIN=.yourdomain.com` shares the session across them.

**CORS errors in the browser console after moving to a domain**
`FRONTEND_URL` still points at the old origin. It is always an allowed origin;
anything else has to be listed in `CORS_ORIGINS`.

**The frontend still calls the old host after changing `.env`**
`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` are compiled into the
bundle. Rebuild: `docker compose build frontend`, or `pnpm build` if you run it
directly.

**Every webhook delivery is rejected as forged**
Something between Meta and the API is altering the request body. The signature
is an HMAC over the exact bytes Meta sent, so any module that rewrites,
re-encodes or pretty-prints the body breaks it. Check for body-modifying
filters in the proxy, and for a WAF in front of it.

**The inbox stops updating live on the new domain**
Socket.IO connects to `/socket.io` on `NEXT_PUBLIC_SOCKET_URL` and needs
WebSocket upgrade headers through the proxy. Caddy does this automatically;
nginx needs the `Upgrade` and `Connection` headers shown above.

**Only some history imported**
The import deliberately takes the 50 most recent threads, 50 messages each, so
a connect stays fast and does not hit Graph rate limits. Constants live in
`DEFAULT_IMPORT_LIMITS` in
`backend/src/modules/integrations/facebook-import.service.ts`.

---

## The manual fallback

**Enter a token manually** on the same screen is still there. It takes a Page
ID and a long-lived Page access token directly, for the cases OAuth cannot
serve — a System User token from Business Manager, or a Page whose admin cannot
log in to this CRM.

That path does **not** subscribe the Page or import history. If you use it, do
the subscription yourself in the Messenger dashboard.
