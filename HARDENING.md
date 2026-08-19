# Hardening Notes

Aggregation Hub is an early-stage starter. It has not received an independent security assessment, penetration test, load test, or compliance certification. Passing the repository checks does not establish production safety.

## Before public deployment

- Review every route for authentication, object-level authorization, input limits, and non-disclosing errors.
- Use short-lived, revocable sessions; protect refresh credentials at rest; and test account recovery and lockout behavior.
- Restrict HTTP and WebSocket origins to an explicit production allowlist. Add edge rate limits and abuse controls.
- Enforce strict 12-Factor App configuration (Factor III: Config):
  - Store all deploy-specific config in the environment, never in source code.
  - Keep secrets in Cloudflare secret bindings (`wrangler secret put`). Never place credentials, API tokens, personal email addresses, or production resource identifiers in source, logs, client bundles, or committed configuration.
  - Maintain template configurations (`wrangler.jsonc`, `.env.example`) with zero/placeholder IDs in source control; keep local overrides (`wrangler.local.jsonc`, `.env.local`) strictly ignored in `.gitignore`.
- Confirm that moderation thresholds, administrator membership, quota updates, and concurrent votes fail closed.
- Define retention and deletion policies for accounts, messages, moderation records, sessions, and audit events.
- Back up D1, rehearse migrations and rollback, and verify Durable Object upgrade behavior in a non-production environment.
- Use sampled structured logs without sensitive request bodies, tokens, or unnecessary personal data. Add alerts and an incident-response runbook.
- Pin reviewed deployments, keep dependencies current, run static analysis and dependency auditing, and commission an external review before handling sensitive data.

## Release gate

A production owner should explicitly sign off on the threat model, access-control tests, rate-limit tests, migration recovery, privacy obligations, monitoring, and rollback plan. Until then, deploy only with synthetic data in a controlled environment.

