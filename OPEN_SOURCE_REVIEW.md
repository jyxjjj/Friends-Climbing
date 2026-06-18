# Open Source Readiness and Security Review

Date: 2026-06-18

## Status

Security, auth, validation, export, CI, and deployment scripts have been updated for a safer public baseline. Remaining accepted risk: `/api/init-owner` still has a first-initializer race/claim window by design; deployers must initialize immediately after deploy and review KV for the expected Owner user/member.

## Confirmed Design Boundaries

- Cloudflare Workers + TypeScript + React UMD stack remains unchanged.
- License remains `AGPL-3.0-or-later`; deployed service settings page links to source.
- Single-team model: every active `Member` must be bound to exactly one `User`, and every `User` has a `memberId`.
- Auth uses Ed25519 JWT access/refresh cookies plus KV-backed refresh sessions. Legacy `sessions:{id}` request-renewal behavior has been removed.
- All authenticated writes continue to require strict same-origin `Origin` validation.

## Fixed Areas

- Access/refresh JWT authentication, refresh rotation, logout revocation, disabled-user and tokenVersion invalidation.
- Login dummy PBKDF2 path, body size limits, username/password length checks, IP/username rate limiting, malformed JSON handling.
- Strict validation for schemas, dates, amounts, member references, payer references, body data references, and versioned updates.
- Centralized route/method handling with `405 Allow`, clearer `403`/`404`/`409` behavior, and sanitized error responses.
- Version conflict checks for editable resources.
- Record deletion cascades image metadata and R2 objects.
- Image upload validates all files before writing, checks magic bytes, limits count/size/total size, and compensates R2 writes if KV write fails.
- AA calculation uses integer floor shares and assigns remainder to Owner member.
- Export uses stable CSV columns, formula-injection protection, strict format handling, true XLSX zip output, and no-store response headers.
- Workflow is manual-only and runs install, audit, typecheck, tests, format check, resource ensure, JWT GitHub-Secrets-to-Worker-Secrets synchronization, and deploy.
- Deployment script uses Wrangler R2 bucket commands and structured TOML parsing/update.
- Official Workers types replace the hand-written incomplete worker type declaration.

## Remaining Accepted Risks / Notes

- `/api/init-owner` first claim remains accepted operational risk.
- List pagination still reads KV list results then sorts for stable cursor output; documented as suitable for small-team scale.
- `/api/init-owner` still has a first-owner registration window during initial deployment; this is an accepted operational risk and should be closed immediately after Owner creation.
- KV list-then-sort pagination is acceptable for a small team but is not designed for large multi-tenant datasets.
- CSP now uses a fresh random script nonce for each HTML response and no `script-src 'unsafe-inline'`; inline styles still require `style-src 'unsafe-inline'`, which remains a tracked residual risk.

## Current Frontend Coverage

The SPA supports User management, read-only Member details, plan member/budget editing, record member/budget/expense/body-data editing, image management, and AA display. Member rows are still managed through User create/edit rather than direct Member CRUD.

## JWT Secret Operations

Deployers generate Ed25519 JWKs manually, store `JWT_ED25519_PRIVATE_JWK`, `JWT_ED25519_PUBLIC_JWK`, and `JWT_KEY_ID` in GitHub Actions Secrets, and let the workflow synchronize them to Cloudflare Worker Secrets before deploy. Private JWK values must never be committed, logged, or posted publicly.

## Tests

The test suite includes Node behavior/security regression tests for list normalization, AA remainder handling, export neutralization/XLSX structure, workflow properties, auth-source safeguards, validation, and sanitized errors. It does not claim browser E2E coverage.
