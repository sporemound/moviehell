# Contributing

Thanks for helping improve the Movie Hell Aggregation Hub starter.

## Development

```bash
npm ci
npm run worker:typegen
npm run dev
npm run worker:dev
```

Run the complete local verification before opening a pull request:

```bash
npm run validate
```

## Pull request guidelines

- Keep changes scoped and easy to review.
- Add or update tests and documentation when behavior changes.
- Regenerate `worker-configuration.d.ts` after changing bindings.
- Do not commit secrets, resource IDs, local state, logs, generated scan output, or personal metadata.
- Describe migrations, compatibility changes, and rollback requirements.

## Security-sensitive work

For authentication, authorization, realtime connections, moderation, quotas, storage, or cryptography, include a short threat analysis and evidence for the relevant failure-path tests. Report vulnerabilities through [SECURITY.md](./SECURITY.md), not a public issue.
