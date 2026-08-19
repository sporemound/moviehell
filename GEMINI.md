# Agent Directives & Privacy Boundaries

These directives are permanently active for all AI coding assistants, agents, and pair-programming sessions in this codebase.

## 1. Zero Real PII & User Data Rule (Non-Negotiable)
- **NEVER** write, hardcode, generate, test with, or commit real personal user data (emails, real names, user passwords, personal handles, third-party streamer channels, or live infrastructure IDs).
- **Synthetic Placeholders Only**: All mock data, tests, and documentation must use RFC 2606 reserved domains (`@example.org`, `@example.com`, `stream.example.org`, `channel_slug`).

## 2. 12-Factor App (Factor III: Config) Compliance
- **Separation of Config from Code**: Backing service IDs (D1 database IDs, R2 buckets), allowed admin user lists, and stream origins must be dynamically injected via environment variables or secret bindings (`wrangler secret put`).
- **Template Configs Only**: Committed configuration files (`wrangler.jsonc`, `.env.example`) must contain zero UUIDs (`00000000-0000-0000-0000-000000000000`) and blank lists. Real deploy overrides (`wrangler.local.jsonc`, `.env.local`) must stay in `.gitignore`.

## 3. Mandatory Automated Privacy Verification
- Before submitting code changes or proposing commits, always run:
  ```bash
  npm run privacy:scan
  npm run validate
  ```
- Any failure in `privacy:scan` must be resolved immediately before staging.
