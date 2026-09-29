# Friends Included status

Last updated: 2026-09-29 (Europe/Riga)

## Current release state

The audited baseline has been copied into this workspace, repaired, and rebuilt. It is ready for account-backed deployment, but it is not yet live. No external URL, migration result, Sheet write, Telegram webhook result, or live acceptance result is claimed below.

## Completed and verified locally

- Audited the implementation against the frozen master prompt and `REQUIREMENTS.md`.
- Preserved the existing small Vercel/Supabase architecture instead of replacing it.
- Replaced floating-point money parsing and commission arithmetic with exact decimal parsing and integer/BigInt cent arithmetic.
- Rejects fractional-cent and scientific-notation amount inputs.
- Telegram webhook now fails closed if its secret is absent and uses a timing-safe comparison.
- Added atomic Supabase claims for Sheets synchronization and Telegram notification delivery, including safe recovery of stale claims.
- Repeated successful notification and Sheets retry calls are idempotent at the service boundary.
- Added deterministic adapter tests proving that a Sheet decision updates the original reference row rather than appending a duplicate.
- Added deterministic Telegram tests for immutable destination use and detailed changed-split messages.
- Inspected the built interface in a local browser. It rendered correctly and showed the expected connection/setup state because live environment variables are absent.
- Confirmed there are no local `.env`, `.env.local`, PEM, or key files in the project.

## Validation evidence

Command (using the Codex bundled Node runtime because `npm` is not on this shell's default `PATH`):

```bash
PATH=/Users/artursspalis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/artursspalis/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH pnpm run verify
```

Result:

- Syntax checked: 17 JavaScript files.
- Automated tests: 17 passed, 0 failed.
- Test 1 exact control totals: passed.
- Test 2 cumulative exact control totals and reconciliation: passed.
- Authorization, validation, rounding/tie-breaking, database locks, RLS checks, Telegram relinking, fail-closed webhook, atomic side-effect claims, Sheets upsert, and Telegram payload coverage: passed.
- Production static build: `Built static application in dist/`.

## External state discovered

- No deployment environment variables are present in this task environment.
- GitHub CLI, Vercel CLI, and Supabase CLI are not installed.
- A local Git repository now exists on `main`, and all release files are staged. A commit is waiting because no Git author name/email is configured and no authenticated GitHub account is available to supply the correct identity.
- The deployment browser reached GitHub's sign-in page; no authenticated GitHub session is available there.

## Exact blocker and next step

The project cannot be published or connected without the owner's external accounts and secrets. The next smallest action is for the owner to sign in to GitHub in the already-open browser tab. After that, repository creation and push can continue. Supabase, Google Cloud/Sheets, Telegram BotFather, and Vercel account actions and credentials will still be required in sequence; secrets must be entered into provider settings, never committed.

## Live checks still required

- Create the GitHub repository and push this source.
- Create Supabase, apply `supabase/migrations/001_schema.sql`, and configure its server secret.
- Create the Google service account and spreadsheet, share it with the service account, and verify both tabs/headers and real writes.
- Create the Telegram bot, configure the webhook secret and URL, and verify authenticated webhook delivery.
- Deploy through Vercel, configure all variables, and verify `/api/health` reports every integration configured.
- Execute the required live S01/E01 Telegram paths, all remaining Test 1/Test 2 entries and decisions, persistence, Sheet rows, return notifications, role denials, duplicate decision behavior, and exact final totals.
- Record final non-secret URLs and live evidence here; keep S05 pending and E07 awaiting allocation.
