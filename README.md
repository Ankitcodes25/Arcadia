# Arcadia

Arcadia is organized as a separate frontend and backend application.

## Structure

- `frontend/` — React + Vite application
- `backend/` — Express authentication API

## Frontend

The frontend source is grouped into `assets`, `components`, `constants`, `contexts`, `hooks`, `lib`, `pages`, `services`, `types`, and `utils`.

## Backend

The backend separates configuration, controllers, middleware, models, routes, services, validators, utilities, and error handling.

## Run

Copy the example environment files and provide local-only secrets before starting the services. Never commit `.env` files or place backend secrets in `VITE_*` variables.

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Admin Panel sign-in uses `ADMIN_EMAIL`, `ADMIN_USERNAME`, and the session settings in `backend/.env`. If that email has an active MongoDB `ADMIN` account, its current account password is used, so password changes made through Account & Security work for the Admin Panel too. `ADMIN_PASSWORD_HASH` remains the fallback when no matching admin account is provisioned.

For production, set `NODE_ENV=production`, an explicit HTTPS `FRONTEND_URL` (and any additional origins in `CORS_ORIGIN`), a high-entropy `JWT_SECRET`, a TLS-protected `MONGODB_URI`, Google OAuth server credentials, and SMTP delivery for password-reset messages. Production startup fails closed when those required values are absent or unsafe. Cross-site frontend/API deployments should use `COOKIE_SAME_SITE=none`; same-site deployments should prefer `lax` or `strict`.

The frontend requires `VITE_API_URL` for production builds. Set `VITE_GOOGLE_AUTH_ENABLED=true` only when the backend Google OAuth routes are configured. Configure the static host to serve `index.html` for SPA routes and to send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and a clickjacking protection header.

## Verification

```bash
cd backend
npm test
npm run check
npm audit --audit-level=high

cd ../frontend
npm run typecheck
npm run lint
VITE_API_URL=https://api.example.com npm run build
```
