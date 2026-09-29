import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { upsertTransaction } from "../lib/sheets.js";
import { decisionMessage, sendMessage, submissionMessage } from "../lib/telegram.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service@example.test";
process.env.GOOGLE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
process.env.GOOGLE_SHEET_ID = "sheet-test";
process.env.TELEGRAM_BOT_TOKEN = "test-token";

test("Sheets synchronization appends once and then updates the same reference", async (context) => {
  const rows = [];
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || "GET" });
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access" });
    if (String(url).includes("A2%3AA")) return Response.json({ values: rows.map((row) => [row[0]]) });
    if (String(url).includes(":append")) {
      rows.push(JSON.parse(options.body).values[0]);
      return Response.json({ updates: { updatedRows: 1 } });
    }
    if (options.method === "PUT" && /A\d+%3AQ\d+/.test(String(url))) {
      const rowNumber = Number(String(url).match(/A(\d+)%3AQ/)[1]);
      rows[rowNumber - 2] = JSON.parse(options.body).values[0];
      return Response.json({ updatedRows: 1 });
    }
    return Response.json({ updatedRows: 1 });
  });

  const sale = {
    kind: "sale", reference: "S02", submitted_at: "2026-09-29T10:00:00Z",
    submitter: { full_name: "Anastasia Ferrari" }, customer: "Daniel King", project: "B",
    description: "University friends", amount_cents: 200000,
    proposed_richard_pct: 0, proposed_anastasia_pct: 50, proposed_jean_claude_pct: 50,
    final_richard_pct: null, final_anastasia_pct: null, final_jean_claude_pct: null,
    richard_earned_cents: 0, anastasia_earned_cents: 0, jean_claude_earned_cents: 0,
    status: "Pending approval"
  };
  assert.deepEqual(await upsertTransaction(sale), { operation: "appended" });
  Object.assign(sale, {
    final_richard_pct: 20, final_anastasia_pct: 40, final_jean_claude_pct: 40,
    richard_earned_cents: 4000, anastasia_earned_cents: 8000, jean_claude_earned_cents: 8000,
    status: "Approved"
  });
  assert.deepEqual(await upsertTransaction(sale), { operation: "updated", row: 2 });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].slice(10, 17), [20, 40, 40, "40.00", "80.00", "80.00", "Approved"]);
  assert.equal(requests.filter((request) => request.url.includes(":append")).length, 1);
});

test("Telegram messages contain decision details and use the supplied destination", async (context) => {
  let delivery;
  context.mock.method(globalThis, "fetch", async (url, options) => {
    delivery = { url: String(url), body: JSON.parse(options.body) };
    return Response.json({ ok: true, result: { message_id: 42 } });
  });
  const item = {
    kind: "sale", reference: "S03", amount_cents: 150000, commission_pool_cents: 15000,
    proposed_richard_pct: 40, proposed_anastasia_pct: 40, proposed_jean_claude_pct: 20,
    final_richard_pct: 20, final_anastasia_pct: 30, final_jean_claude_pct: 50,
    richard_earned_cents: 3000, anastasia_earned_cents: 4500, jean_claude_earned_cents: 7500
  };
  const message = decisionMessage(item);
  assert.match(message, /Split changed from 40\/40\/20/);
  assert.match(message, /Richard: 20% \(€30\.00\)/);
  assert.match(message, /Jean-Claude: 50% \(€75\.00\)/);
  await sendMessage(123456, message);
  assert.equal(delivery.body.chat_id, 123456);
  assert.equal(delivery.body.text, message);
  assert.match(submissionMessage({ kind: "expense", reference: "E01", amount_cents: 12000, proposed_allocation: "A", status: "Awaiting allocation" }), /E01 recorded.*€120\.00.*Awaiting allocation/);
});
