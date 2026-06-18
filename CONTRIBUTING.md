# Contributing

## Development Environment

1. Install Node.js 24 and npm.
2. Run `npm ci`.
3. Start the Worker locally with `npm run dev`.
4. Run `npm run typecheck` before submitting changes.

## Commit Convention

Use small, focused commits. Prefer Conventional Commits such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:`.

## Pull Request Guidelines

- Explain the user-visible change and any migration impact.
- Include tests or checks run, especially `npm run typecheck`.
- Keep PRs focused and avoid unrelated formatting churn.
- Update README and security documentation when behavior changes.

## Security Requirements

- Do not commit secrets, Cloudflare tokens, account IDs intended to remain private, session IDs, or production data.
- Validate all runtime input; TypeScript types are not a substitute for validation.
- Preserve Owner/Member authorization rules and add centralized permission checks for new resources.
- Protect cookie-authenticated state-changing endpoints against CSRF.
- Report suspected vulnerabilities privately according to `SECURITY.md`.
