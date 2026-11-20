# Repository instructions

- Read [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) before starting
  development, and read the relevant detailed architecture/phase documents.
- Work only within the user's authorized scope. Preserve existing architecture,
  security boundaries, validation, functionality, and all user changes.
- Inspect relevant code before changing it; implement sequentially and avoid
  unnecessary broad audits or redesigns.
- Add focused tests for new behavior, avoid duplicating accepted tests, and
  run relevant regression checks plus typecheck, lint, and build as appropriate.
- Never claim a check passed unless it ran. Report environmental failures and
  limitations accurately.
- Do not edit database schemas, migrations, RPCs, RLS policies, or API
  contracts without explicit approval. Do not touch hosted Supabase without
  explicit authorization.
- Do not reset, clean, stash, discard, restore, or overwrite existing user
  changes. Never commit or push without explicit authorization.
- Document important decisions and provide one concise consolidated report.
