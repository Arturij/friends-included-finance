# Manual setup checklist

Follow these steps in order. Text in `UPPER_CASE` is a placeholder that you must replace. Never commit tokens, private keys, or `.env` files.

## 1. Verify the downloaded project

Open a terminal in the project folder and run:

```bash
npm run verify
```

Expected result: all tests pass and `Built static application in dist/` appears. The project has no third-party runtime dependencies, so `npm install` is not required.

## 2. Create the GitHub repository

Create an empty repository on GitHub without generating a README, license, or `.gitignore`. Then run these commands from the project folder:

```bash
git init
git add .
git commit -m "Build Friends Included finance system"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

If the repository already exists locally, do not run `git init` again. Use `git status` and confirm that `.env` or `.env.local` is not staged.

## 3. Configure Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and create a new query.
3. Copy the entire contents of `supabase/migrations/001_schema.sql`, paste it into the query, and run it once.
4. In Supabase project settings, copy:
   - Project URL → `SUPABASE_URL`
   - Server-only secret key beginning `sb_secret_` → `SUPABASE_SECRET_KEY`
5. Do not use the publishable or anonymous key for `SUPABASE_SECRET_KEY`.

The migration is safe to run again for tables and seeded employees, but it deletes and recreates trigger/function definitions. Apply it before entering final test data.

## 4. Configure Google Sheets

1. Create a Google Cloud project.
2. Enable **Google Sheets API**.
3. Create a service account and a JSON key.
4. Create one spreadsheet containing two tabs named exactly `Sales` and `Expenses`.
5. Share the spreadsheet with the service account's `client_email` as **Editor**.
6. Give the instructor **Viewer** access. Do not grant public editing.
7. Record these values:
   - JSON `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - JSON `private_key` → `GOOGLE_PRIVATE_KEY`
   - ID between `/d/` and `/edit` in the spreadsheet URL → `GOOGLE_SHEET_ID`
   - Full spreadsheet URL → `GOOGLE_SHEET_URL`

When adding `GOOGLE_PRIVATE_KEY` to Vercel, paste the complete value including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`. Real line breaks and escaped `\n` line breaks are both supported by the application.

## 5. Create the Telegram bot

1. Open a chat with `@BotFather` in Telegram.
2. Run `/newbot` and follow the prompts.
3. Record the token as `TELEGRAM_BOT_TOKEN`.
4. Record the bot URL, such as `https://t.me/YOUR_BOT_USERNAME`, as `TELEGRAM_BOT_URL`.
5. Generate a webhook secret containing only allowed characters:

```bash
openssl rand -hex 32
```

Record the result as `TELEGRAM_WEBHOOK_SECRET`.

## 6. Import the project into Vercel

Import the GitHub repository into Vercel. The repository's `vercel.json` already sets:

- Build command: `npm run build`
- Output directory: `dist`
- Serverless endpoints: the root `api` directory

Add these environment variables to **Production, Preview, and Development** unless you intentionally want different test environments:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Server-only `sb_secret_...` key |
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Output from `openssl rand -hex 32` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service-account `client_email` |
| `GOOGLE_PRIVATE_KEY` | Complete service-account private key |
| `GOOGLE_SHEET_ID` | Spreadsheet ID |
| `APP_URL` | `https://YOUR_PROJECT.vercel.app` |
| `STUDENT_NAME` | Your name as it should appear on the site |
| `TELEGRAM_BOT_URL` | `https://t.me/YOUR_BOT_USERNAME` |
| `GOOGLE_SHEET_URL` | Full instructor-viewable Sheet URL |
| `GITHUB_REPOSITORY_URL` | Full instructor-accessible repository URL |

Deploy the application. Replace `YOUR_PROJECT` below and open:

```text
https://YOUR_PROJECT.vercel.app/api/health
```

Every returned configuration value must be `true`. The endpoint reports only presence; it never returns secret values.

## 7. Register the Telegram webhook

First verify that the production deployment contains the same `TELEGRAM_WEBHOOK_SECRET` you recorded. Then replace the three placeholders and run:

```bash
FI_APP_URL='https://YOUR_PROJECT.vercel.app'
printf 'Telegram bot token: '
stty -echo; IFS= read -r FI_BOT_TOKEN; stty echo; printf '\n'
printf 'Webhook secret: '
stty -echo; IFS= read -r FI_WEBHOOK_SECRET; stty echo; printf '\n'

curl --fail-with-body -X POST "https://api.telegram.org/bot${FI_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  --data "{\"url\":\"${FI_APP_URL}/api/telegram\",\"secret_token\":\"${FI_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\"]}"

unset FI_BOT_TOKEN FI_WEBHOOK_SECRET
```

Expected response:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

Check the registered webhook:

```bash
printf 'Telegram bot token: '
stty -echo; IFS= read -r FI_BOT_TOKEN; stty echo; printf '\n'
curl --fail-with-body "https://api.telegram.org/bot${FI_BOT_TOKEN}/getWebhookInfo"
unset FI_BOT_TOKEN
```

Confirm the returned URL ends with `/api/telegram` and `last_error_message` is absent.

## 8. Link your Telegram account

1. Open the bot link and press **Start**, or send `/start`.
2. Open the deployed website.
3. Select **Svetlana de Monte Carlo** as the demonstration role.
4. Open **Manager setup**.
5. Select the observed Telegram account and link it to Richard.

The same account can later be relinked to Kevin or Jean-Claude. Previously submitted bot transactions keep their original chat destination.

## 9. Execute the assignment tests

Use the exact transactions and decisions in `README.md` and `REQUIREMENTS.md`.

Test 1 must finish with:

- Project A result: €700.00
- Project B result: €1,800.00
- Company result: €2,400.00
- Richard commission: €90.00
- Anastasia commission: €110.00
- Jean-Claude commission: €100.00

Test 2 cumulative results must finish with:

- Project A result: €2,050.00
- Project B result: €2,180.00
- Company result: €3,930.00
- Richard commission: €140.00
- Anastasia commission: €175.00
- Jean-Claude commission: €215.00

Do not clear records after Test 2.

## 10. Final submission check

Confirm all of the following before submitting:

- S01 and E01 were submitted through the actual Telegram bot.
- Approval/allocation return notifications were received.
- Sales and Expenses Sheet rows contain proposed and final values.
- Retrying a failed synchronization updates the same row.
- Refreshing the website preserves records and totals.
- S05 remains pending and E07 remains awaiting allocation.
- The website shows your name and working Telegram, Sheet, and GitHub links.
- The Sheet is viewable by the instructor and the GitHub repository is accessible to the instructor.

Only then place the Vercel URL in your own Day 4 cell in the course spreadsheet. Do not edit any other student's cells.
