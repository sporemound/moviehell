# Aggregation Hub

Aggregation Hub is a barebones, general-purpose aggregation starter. It combines a small React client with a Cloudflare Worker, D1 persistence, and a SQLite-backed Durable Object for room-scoped realtime coordination. The interface is intentionally unbranded.

This is a starter, not a production-ready service. Review [HARDENING.md](./HARDENING.md) and [SECURITY.md](./SECURITY.md) before exposing it publicly.

## Local setup

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm run worker:typegen
```

Run the client and Worker in separate terminals:

```bash
npm run dev
npm run worker:dev
```

The client binds to `127.0.0.1:5173`; Wrangler uses its local runtime on port `8787`. Local Cloudflare state, environment files, and logs are ignored by Git.

Set `VITE_APP_NAME` at build time when a deployment needs a site-specific display name; the reusable default is `Aggregator`.

## Database migrations

Apply the committed D1 migrations locally before exercising database-backed routes:

```bash
npx wrangler d1 migrations apply aggregation-hub-db --local
```

For a deployment, create the database, copy `wrangler.jsonc` to the ignored `wrangler.local.jsonc`, and replace only the all-zero `database_id` in that local copy:

```bash
npx wrangler d1 create aggregation-hub-db
npx wrangler d1 migrations apply aggregation-hub-db --remote --config wrangler.local.jsonc
```

Do not commit `wrangler.local.jsonc`, `.dev.vars*`, `.env*`, tokens, account identifiers, or production resource IDs. Put any future secret binding in Cloudflare with `wrangler secret put`, not in `vars` or source control. `ADMIN_USER_IDS` and `APPROVAL_THRESHOLD` are non-secret settings; an empty admin allowlist is the safe default.

## API outline

- Authentication and current-user routes manage signup, login, refresh, revocation, and session inspection.
- Room and message routes provide aggregate membership and message operations.
- A short-lived WebSocket ticket route authorizes room-scoped realtime connections.
- `POST /api/admin/rooms/:roomId/moderation` creates `remove_user` or `delete_message` actions.
- `POST /api/admin/moderation/:id/votes` records an administrative vote; `GET /api/admin/moderation` and `GET /api/admin/moderation/:id` inspect moderation state.
- `POST /api/admin/quotas/allocate` manages quota allocation.

Consult `worker.ts` for the exact request and response contract. Clients should treat all input as untrusted and handle non-2xx JSON responses.

## Validation

```bash
npm run validate
```

This runs frontend and Worker typechecks, verifies generated bindings, builds static assets, performs a Wrangler dry run, and audits dependencies at the configured severity threshold.

## Deployment checklist

1. Use Node.js 22 or newer and run `npm ci`.
2. Create `wrangler.local.jsonc`; insert the real D1 ID without committing it.
3. Review the admin allowlist and approval threshold.
4. Store secrets with Wrangler and apply D1 migrations remotely.
5. Run `npm run validate`.
6. Deploy with `npx wrangler deploy --config wrangler.local.jsonc`.
7. Verify authentication, authorization, moderation, quotas, realtime origin checks, logs, and rollback procedures in the target environment.
