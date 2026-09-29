# Requirements cross-check

Status meanings: **Implemented** is present in code; **Automated** is exercised by local tests; **Live check** requires configured external accounts.

| Assignment requirement | Implementation | Verification |
|---|---|---|
| Supabase is the source of truth | `supabase/migrations/001_schema.sql`, `lib/supabase.js` | Implemented; live check |
| One Telegram bot for submissions and notifications | `api/telegram.js`, `lib/telegram.js` | Implemented; live check |
| Vercel website, forms, approvals, dashboard | `public/`, `api/`, `vercel.json` | Implemented; build check |
| Google Sheets readable copy with Sales and Expenses tabs | `lib/sheets.js` | Implemented; live check |
| Shared Telegram and website rules | Both call `lib/service.js` and `lib/domain.js` | Implemented |
| Five demonstration roles | Seed migration and selector | Implemented |
| Server-side role enforcement | `lib/service.js`, `api/app.js`, SQL functions | Implemented; automated domain checks |
| Telegram user captured and manager-linked | Contacts table, webhook capture, Manager setup | Implemented; live check |
| Unlinked Telegram user refused | `api/telegram.js` | Implemented; live check |
| Original bot chat retained per submission | `source_chat_id`, `notification_chat_id` | Implemented; live check |
| Sales and expense required fields | Domain validators and database constraints | Implemented; automated |
| Positive amounts and unique references | Validators plus SQL checks/unique index | Implemented; automated/live DB check |
| Pending sales excluded from totals | `calculateDashboard` | Automated |
| 10% commission pool and exact split | Domain and atomic SQL function | Automated |
| Cent rounding and specified tie priority | Domain and SQL function | Automated |
| Commission belongs to sale project | Dashboard derives it from approved sale | Automated |
| Expenses immediately reduce company result | Dashboard includes all saved expenses | Automated |
| A/B expenses await allocation | Submission service | Implemented; automated calculation |
| Overhead allocated automatically | Submission service | Implemented; automated calculation |
| Allocation does not deduct twice | Derived totals and one transaction row | Automated |
| Original and final decisions preserved | Separate proposed/final columns | Implemented |
| Repeated decisions are idempotent | Row locks, boolean decision result, and atomic side-effect claims | Implemented; live DB check |
| Project and company result formulas | `calculateDashboard` | Automated against Test 1 and Test 2 |
| Required dashboard measures | Dashboard cards | Implemented |
| Submission confirmations after save | Telegram webhook sends after service returns saved row | Implemented; live check |
| Sale decision notification details | `decisionMessage` | Implemented; live check |
| Expense decision notification details | `decisionMessage` | Implemented; live check |
| No overhead decision notification | `Not required` state | Implemented |
| No linked website recipient is visible | `No recipient` status | Implemented |
| Sheet proposed/final columns separated | Explicit Sales/Expenses header schemas | Implemented; live check |
| Sheet decisions update existing row | Reference lookup and update in `upsertTransaction` | Automated adapter test; live check |
| Sheet failure retained and retryable | Status/error fields and manager retry | Implemented; live check |
| Telegram failure retained and retryable | Status/error fields, atomic claim, and manager retry | Implemented; adapter test/live check |
| Test 1 expected totals | `test/domain.test.js` | Automated |
| Test 2 expected totals | `test/domain.test.js` | Automated |
| Invalid split, amount, and permissions | Domain tests and API checks | Automated |
| Duplicate and repeated operations leave totals unchanged | SQL uniqueness and idempotent RPC functions | Implemented; live DB check |
| Results are derived, not hard-coded | Dashboard consumes transaction records | Automated calculations |
| Secrets stay server-side | API-only environment access, `.gitignore`, `.env.example` | Implemented; repository review |
| Instructor links and brief instructions | Header links and README | Implemented after env configuration |
| Real S01 and E01 bot flow | Live procedure in README | Live check required |
| GitHub, Vercel, viewable Sheet, final course URL | Deployment procedure in README | Owner account action required |

## Exact Test 1 entries

- S01 Richard / Olivia Rose / A / €1,000 / 50–30–20.
- S02 Anastasia / Daniel King / B / €2,000 / 0–50–50; change to 20–40–40.
- E01 Materials / €120 / A; approve A.
- E02 Travel / €80 / proposed B; change to A.
- E03 Other / €100 / Company overhead.

## Exact Test 2 additions

- S03 Jean-Claude / Emma Stonebridge / A / €1,500 / 40–40–20; change to 20–30–50.
- S04 Richard / Lucas Green / B / €800 / 25–25–50; approve.
- S05 Richard / Mia Brooks / B / €600 / 100–0–0; leave pending.
- E04 Materials / €250 / B; approve B.
- E05 Travel / €90 / proposed A; change to B.
- E06 Other / €60 / Company overhead.
- E07 Materials / €140 / A; leave awaiting allocation.
