# Privacy Boundaries & 12-Factor Configuration Standard

This document outlines the architectural boundaries and automated controls established in Movie Hell to guarantee user privacy, prevent credential leaks, and strictly enforce the [12-Factor App (Factor III: Config)](https://12factor.net/config) methodology across all code, tests, and version control.

---

## 1. Core Principles

1. **Zero Real User Data in Source Code**:
   - No real user emails, passwords, usernames, third-party streamer handles, or personal addresses may ever be written into source files, unit tests, mock catalogs, documentation, or commit messages.
2. **Synthetic Data Standard (RFC 2606)**:
   - All examples, placeholder fixtures, and test users must strictly use RFC 2606 reserved domains:
     - Emails: `user@example.org`, `admin@example.com`
     - Domains: `stream.example.org`, `custom.example.org`
     - Channel slugs: `channel_handle`, `example_channel`
3. **Strict Separation of Config from Code**:
   - All deploy-varying values (D1 Database IDs, R2 Bucket handles, Admin/Moderator user lists, Stream origins) must be stored in the environment, never in tracked code.
   - Secrets are managed via Cloudflare secret bindings (`wrangler secret put`).
   - Tracked configs (`wrangler.jsonc`, `.env.example`) contain zero UUIDs (`00000000-0000-0000-0000-000000000000`) and empty defaults. Real deployment overrides (`wrangler.local.jsonc`, `.env.local`) are strictly gitignored.

---

## 2. The 4-Layer Boundary System

```
+-------------------------------------------------------------------+
| Layer 1: Agent & Pair-Programming Directives (AGENTS.md, GEMINI.md) |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| Layer 2: Local Pre-Commit Hook (.git/hooks/pre-commit)             |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| Layer 3: Automated Privacy Scanner (npm run privacy:scan)          |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| Layer 4: GitHub Actions CI (.github/workflows/ci.yml)              |
+-------------------------------------------------------------------+
```

### Layer 1: Agent Directives (`AGENTS.md` / `GEMINI.md`)
Directs AI coding assistants and pair-programming agents on every turn to enforce the Zero-PII rule, use RFC 2606 placeholders, and run automated privacy scans before suggesting changes.

### Layer 2: Local Pre-Commit Hook (`.git/hooks/pre-commit`)
Intercepts `git commit` locally and runs the privacy scanner. If any non-compliant pattern (e.g. real emails or live database IDs) is staged, the commit is aborted.

### Layer 3: Automated Privacy Scanner (`npm run privacy:scan`)
A Node.js scanner (`scripts/privacy-scan.mjs`) integrated into `npm run validate`. Scans every file in the repository for:
- Non-RFC 2606 email patterns
- Prohibited historical handles / PII
- Hardcoded secret patterns or passwords
- Non-zero Cloudflare D1 UUIDs in tracked configuration files

### Layer 4: GitHub Actions CI (`.github/workflows/ci.yml`)
Runs `npm run validate` (including `privacy:scan`, typechecks, build, and audits) on every push and pull request. Any PR violating privacy standards is automatically blocked from merging.

---

## 3. Verification & Compliance Commands

```bash
# Run privacy & PII boundary scan
npm run privacy:scan

# Run full project validation (Privacy Scan + Typechecks + Build + Dry-Run + Audit)
npm run validate
```
