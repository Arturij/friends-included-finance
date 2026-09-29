# Friends Included finance system

A Vercel-ready finance application for the “Wedding Guests for Hire” Day 4 homework. The website and Telegram bot use the same server-side services. Supabase is the source of truth; Google Sheets is a synchronized review copy.

## What is included

- Responsive role-based website with sale and expense forms, manager decisions, records, delivery state, and financial dashboard.
- Real Telegram webhook with user discovery, role linking, submissions, confirmations, and decision notifications.
- Supabase schema, fictional employee seed data, database constraints, and atomic idempotent decision functions.
- Google Sheets service-account authentication and reference-based row upserts.
- Retryable Sheets and Telegram failure states with atomic delivery claims.
- Exact integer-cent calculations and automated tests for both supplied test datasets and both external adapters.

## Local verification

No package installation is required for the project tests or static build. Use Node.js 20 or newer.

```bash
npm run verify
npm run dev
```

Open `http://localhost:4173` for the static interface. Local API routes require `vercel dev` or a deployed Vercel environment.

## 1. Supabase setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_schema.sql` in the SQL editor or through the Supabase CLI.
3. Copy the project URL and a server-only Supabase secret key (`sb_secret_...`) into Vercel environment variables using `.env.example` as the checklist. The code also accepts the legacy service-role JWT under `SUPABASE_SERVICE_ROLE_KEY` if your project does not provide a secret key.
4. Never expose either server key in client-side code.

The migration enables row-level security, denies browser roles direct table access, seeds the five fictional employees, and exposes manager decision functions only to the service role.

## 2. Google Sheets setup

1. Create a Google Cloud project and enable the Google Sheets API.
2. Create a service account and credentials.
3. Create a spreadsheet with tabs named exactly `Sales` and `Expenses`.
4. Share the spreadsheet with the service-account email as Editor.
5. Give the instructor Viewer access; do not grant public editing.
6. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`, and `GOOGLE_SHEET_URL` in Vercel.

The application writes the required headers and upserts each transaction by reference. Approval and retry update the existing row.

## 3. Telegram setup

1. Create a bot using BotFather and set `TELEGRAM_BOT_TOKEN`.
2. Generate a long random value for `TELEGRAM_WEBHOOK_SECRET`.
3. Deploy once so the webhook URL exists.
4. Register the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<token>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<vercel-domain>/api/telegram","secret_token":"<webhook-secret>"}'
```

5. Start the bot in a private chat. The account appears under Svetlana’s **Manager setup** tab.
6. Link that observed Telegram user to the appropriate fictional employee.

Bot commands:

```text
/sale REF | CUSTOMER | A or B | DESCRIPTION | AMOUNT | RICHARD% | ANASTASIA% | JEAN-CLAUDE%
/expense REF | DESCRIPTION | Materials/Travel/Other | AMOUNT | A/B/Company overhead
```

## 4. Vercel and GitHub

1. Create a GitHub repository and commit this project without `.env` files.
2. Import the repository into Vercel.
3. Add every variable listed in `.env.example`.
4. Deploy and inspect `/api/health`; each integration variable should report `true` without revealing its value.
5. Set `APP_URL`, `STUDENT_NAME`, `TELEGRAM_BOT_URL`, `GOOGLE_SHEET_URL`, and `GITHUB_REPOSITORY_URL`.
6. Redeploy if environment values changed.

## Test 1 live procedure

1. Select Svetlana and use **Clear practice data**.
2. Start the bot, link the testing Telegram user to Richard, and submit:

```text
/sale S01 | Olivia Rose | A | One proud uncle and an emotional grandmother | 1000 | 50 | 30 | 20
```

3. Relink the same Telegram account to Kevin and submit:

```text
/expense E01 | Rented suit and fake pearl necklace for the relatives | Materials | 120 | A
```

4. Use website roles to enter S02, E02, and E03 exactly as specified in `REQUIREMENTS.md`.
5. As Svetlana, approve S01, change and approve S02, allocate E01 to A, and move E02 from B to A.
6. Verify the bot decisions reached the captured submission chat, the Sheet rows were updated rather than duplicated, and refreshing the website preserves the records.
7. Verify results: A €700.00, B €1,800.00, company €2,400.00; commissions Richard €90.00, Anastasia €110.00, Jean-Claude €100.00.

## Test 2 live procedure

1. Keep Test 1 data and enter S03–S05 and E04–E07 from `REQUIREMENTS.md`.
2. Before decisions, link the testing account to Jean-Claude; change and approve S03 and verify its changed-split message.
3. Approve S04 and leave S05 pending.
4. Link the account to Kevin; allocate E04 to B, move E05 from A to B, and leave E07 awaiting allocation. E06 allocates automatically to overhead.
5. Verify cumulative results: A €2,050.00, B €2,180.00, company €3,930.00; commissions Richard €140.00, Anastasia €175.00, Jean-Claude €215.00.

## Failure testing

- Temporarily use an invalid Sheet ID, submit a transaction, and verify it remains saved with `Sync failed`. Restore the ID and use **Retry Sheets**; the same row must be created or updated without changing totals.
- Temporarily block or invalidate a Telegram destination before a manager decision. Verify the decision remains approved and notification state is `Failed`. Restore delivery and use **Retry Telegram**.
- Repeat an approval request and confirm there is no new financial effect, Sheet row, or decision notification.
- Attempt invalid splits, zero amounts, duplicate references, Richard approval, and Kevin sale submission. All must fail without changing totals.

## Final submission

Keep the completed Test 2 dataset visible. Confirm that the Vercel page shows the student name, instructions, demonstration selector, forms, manager controls, dashboard, and Telegram/Sheets/GitHub links. After explicit authorization, place only the Vercel URL in the correct Day 4 column of your own row in the course spreadsheet.

For a strict copy-and-paste setup sequence, use `MANUAL_SETUP.md`.
