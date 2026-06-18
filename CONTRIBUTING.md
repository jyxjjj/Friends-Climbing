# Contributing

## Development Environment

1. Install Node.js 24 and npm.
2. Run `npm ci --ignore-scripts`.
3. Start locally with `npm run dev`.
4. Before submitting, run `npm run typecheck`, `npm test`, `npm audit --audit-level=high`, and `npm run format:check`.

## Commit Convention

Use small, focused commits. Prefer Conventional Commits such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:`.

## Pull Request Guidelines

- Explain user-visible changes, security impact, and migration impact.
- Include tests/checks run.
- Update README, SECURITY, and review documentation when behavior changes.
- Do not introduce non-project stacks such as Vue, Java, or Python.

## Security Requirements

- Do not commit secrets, Cloudflare tokens, JWT private keys, session IDs, `.env` files, or production data.
- Validate runtime input strictly; TypeScript types are not a substitute for validation.
- Preserve User/Member one-to-one integrity and centralized permission checks.
- Preserve strict same-origin `Origin` checks for cookie-authenticated writes.
- Report suspected vulnerabilities only through GitHub Private Vulnerability Reporting / GitHub Security Advisory as described in `SECURITY.md`.
