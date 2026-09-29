import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/001_schema.sql", import.meta.url), "utf8");

test("database enforces one reference and positive money", () => {
  assert.match(sql, /reference text not null unique/);
  assert.match(sql, /amount_cents > 0/);
});

test("manager decisions lock rows and suppress repeated side effects", () => {
  assert.match(sql, /for update/);
  assert.match(sql, /status = 'Approved' then return false/);
  assert.match(sql, /status = 'Allocated' then return false/);
});

test("external side effects are claimed atomically before delivery", () => {
  assert.match(sql, /function public\.claim_sheet_sync/);
  assert.match(sql, /sheet_sync_status = 'Syncing'/);
  assert.match(sql, /function public\.claim_notification/);
  assert.match(sql, /notification_status = 'Sending'/);
});

test("Telegram relinking transfers the unique user mapping atomically", () => {
  assert.match(sql, /function public\.link_telegram_employee/);
  assert.match(sql, /set telegram_user_id = null, telegram_chat_id = null/);
  assert.match(sql, /where telegram_user_id = p_telegram_user_id and id <> p_employee_id/);
});

test("browser roles cannot read or mutate source-of-truth tables directly", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.employees, public\.telegram_contacts, public\.transactions from anon, authenticated/);
});
