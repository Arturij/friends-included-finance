import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const service = await readFile(new URL("../lib/service.js", import.meta.url), "utf8");
const supabase = await readFile(new URL("../lib/supabase.js", import.meta.url), "utf8");
const sheets = await readFile(new URL("../lib/sheets.js", import.meta.url), "utf8");
const telegram = await readFile(new URL("../lib/telegram.js", import.meta.url), "utf8");
const webhook = await readFile(new URL("../api/telegram.js", import.meta.url), "utf8");

test("every primary deployment environment variable has a copyable example", () => {
  const sources = [service, supabase, sheets, telegram, webhook].join("\n");
  const names = [...sources.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]);
  for (const name of new Set(names)) {
    if (name === "SUPABASE_SERVICE_ROLE_KEY") continue;
    assert.match(envExample, new RegExp(`^${name}=`, "m"), `${name} is missing from .env.example`);
  }
});

test("complete financial dashboard is restricted to the manager", () => {
  assert.match(service, /actor\.role === ROLES\.MANAGER \? calculateDashboard\(allTransactions\) : null/);
});

test("Telegram webhook fails closed and compares its secret safely", () => {
  assert.match(webhook, /if \(!expected\)/);
  assert.match(webhook, /timingSafeEqual/);
});
