# Friends Included implementation plan

## Milestone 1 Foundation

- Static application shell, role selector, forms, manager workspace, dashboard, records, and configuration links.
- Serverless API entry points and environment contract.
- Validate with `npm run check` and `npm run build`.

## Milestone 2 Domain and persistence

- Exact money calculations, authorization, validation, state transitions, and Supabase schema.
- Atomic SQL functions for manager decisions and safe practice-data clearing.
- Validate with `npm test`.

## Milestone 3 Integrations

- Telegram webhook, user discovery, bot submissions, confirmations, and decision messages.
- Google Sheets service-account authentication, headers, reference-based upserts, status, and retry.
- Validate adapters with syntax checks and deterministic unit tests around their inputs.

## Milestone 4 Acceptance flows

- Execute Test 1 and Test 2 calculations from the supplied records.
- Verify denial, duplicate, idempotency, rounding, and persistence behavior.
- Run `npm run verify`.

## Milestone 5 Live release

- Apply Supabase migration, configure bot and Google Sheet, deploy to Vercel, run the live checklist, and preserve the final dataset.
- Requires the project owner's external accounts and secrets.
- Gate: deployed `/api/health` is fully configured; webhook info has no error; real Sheet rows and Telegram notifications are inspected; Test 1 and cumulative Test 2 totals match exactly.
