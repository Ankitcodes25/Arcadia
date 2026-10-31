# Arcadia Admin Backend

A small, **independent** Express service that provides authentication for the
Arcadia Admin Panel (`frontend/src/Admin_panel/`). It runs separately from the
player-facing backend (`backend/`, port 4000) and shares no code, no database
and no credentials with it.

- **Exactly one admin account**, configured entirely through environment
  variables. There is no registration endpoint, no account management and no
  player/report/moderation API on this service.
- Sessions live in a **HTTP-only, SameSite cookie** scoped to `/api/admin` —
  no token is ever exposed to JavaScript, localStorage or sessionStorage.
- **Port:** `4100` by default (`PORT` to change).
- Keep `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` configured for the account that
  signs in through the shared Arcadia modal. The player login flow runs only
  when this service explicitly returns `accountType: "player"`; a resolver
  outage or unexpected response is a login error, never a player fallback.

## Endpoints

| Method | Path                            | Auth | Purpose                              |
| ------ | ------------------------------- | ---- | ------------------------------------ |
| POST   | `/api/admin/auth/login`         | –    | **Login resolver:** report `accountType`, set the cookie for the admin account |
| GET    | `/api/admin/auth/me`            | ✔    | Verify session, return admin identity |
| POST   | `/api/admin/auth/logout`        | –    | Clear cookie + revoke token server-side |

Everything else returns a JSON 404 — including `/api/admin/auth/register`.

The shared Arcadia login modal submits `{ email, password }` here first. The
server resolves the account type **before** any player authentication runs:

- **Not the admin email** → `200 { "accountType": "player" }` (no session, no
  password check) — a pure routing signal; the frontend continues with the
  existing player login flow.
- **Admin email + wrong password** → `401 { "error": ... }` — a failed admin
  login, never retried as a player login.
- **Admin email + correct password** → session cookie set and
  `200 { "accountType": "admin", "admin": { … } }`.

No response ever contains a password, hash, JWT secret or session token, and a
single attempt never creates both sessions.

## Setup

```bash
cd admin-backend
npm install

# 1. Create your environment file
copy .env.example .env       # (Windows) or: cp .env.example .env

# 2. Generate a bcrypt hash for your admin password (hidden prompt; the
#    password is never printed, logged or written to disk)
npm run hash-password
#    Non-interactive options:
#      echo "your strong password" | npm run hash-password -- --stdin
#      ADMIN_NEW_PASSWORD="..." npm run hash-password -- --env

# 3. Paste the printed hash into .env as ADMIN_PASSWORD_HASH, then set a long
#    random ADMIN_JWT_SECRET (at least 32 characters), e.g.:
#      node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Run
npm run dev        # development (node --watch)
npm start          # production
```

## Environment variables

| Variable | Required | Default | Notes |
| -------- | -------- | ------- | ----- |
| `ADMIN_USERNAME` | ✔ | – | The single admin username (3–64 chars), used as the session identity |
| `ADMIN_EMAIL` | ✔ | – | The login identifier the shared login modal submits; the resolver routes on it. Must be unique (no player uses it) |
| `ADMIN_PASSWORD_HASH` | ✔ | – | bcrypt hash — generate with `npm run hash-password` |
| `ADMIN_JWT_SECRET` | ✔ | – | ≥ 32 chars; used to sign session tokens |
| `ADMIN_FRONTEND_ORIGIN` | ✔ | – | Exact admin frontend origin, e.g. `http://localhost:5173` |
| `PORT` | – | `4100` | Player backend uses 4000 |
| `ADMIN_SESSION_TTL_MINUTES` | – | `240` | Session lifetime (5–720) |
| `COOKIE_SAME_SITE` | – | `lax` | `lax` / `strict`; `none` only in production over HTTPS |
| `BCRYPT_COST` | – | `10` (`12` in production) | Used by `hash-password` |
| `TRUST_PROXY` | – | `0` | Trusted proxy hop count |
| `NODE_ENV` | – | `development` | `development` / `test` / `production` |

Configuration is validated at startup: missing or invalid values fail fast
with a message that **names the variable but never prints its value**.

## Security behaviour

- CORS is pinned to `ADMIN_FRONTEND_ORIGIN` with credentials enabled; any
  other browser origin is refused with 403 before CORS processing.
- Login rate limiting: 8 failed attempts / 15 min per account (email) and 30 /
  15 min per IP (in-memory; resets on restart — it can only ever loosen, never
  lock you out permanently). Player-account resolutions return 200 and are not
  counted, so a player logging in can never consume the admin's failure budget.
- Account resolution is a deliberate **server-side** decision: the identifier
  (`ADMIN_EMAIL`) is compared timing-safely first, and bcrypt always runs for
  the admin email, so the account type is never inferred in the browser. All
  admin credential failures return the same generic 401.
- Logout clears the cookie **and** revokes the token id server-side, so a
  copied cookie dies immediately.
- Responses never include the password hash, JWT secret or session token;
  logs never contain credentials.

## Scripts

| Command | Purpose |
| ------- | ------- |
| `npm start` | Run the server |
| `npm run dev` | Run with auto-restart (`node --watch`) |
| `npm run hash-password` | Generate `ADMIN_PASSWORD_HASH` (password never echoed) |
| `npm test` | Integration tests (real HTTP, ephemeral port) |
| `npm run check` | Syntax check every JS file |
