import { fail, json, readBody, requireMethod } from "../lib/http.js";
import { DomainError } from "../lib/domain.js";
import { timingSafeEqual } from "node:crypto";
import * as db from "../lib/supabase.js";
import { submitExpense, submitSale } from "../lib/service.js";
import { sendMessage, submissionMessage } from "../lib/telegram.js";

const help = `Friends Included finance bot

Salespeople:
/sale REF | CUSTOMER | A or B | DESCRIPTION | AMOUNT | RICHARD% | ANASTASIA% | JEAN-CLAUDE%

Kevin:
/expense REF | DESCRIPTION | Materials/Travel/Other | AMOUNT | A/B/Company overhead

Your Telegram account must first be linked to an employee by Svetlana.`;

function parts(text) {
  return text.split("|").map((value) => value.trim());
}

function parseSale(text) {
  const values = parts(text.replace(/^\/sale(?:@\w+)?\s*/i, ""));
  if (values.length !== 8) throw new DomainError("Use: /sale REF | CUSTOMER | A or B | DESCRIPTION | AMOUNT | RICHARD% | ANASTASIA% | JEAN-CLAUDE%");
  return { reference: values[0], customer: values[1], project: values[2], description: values[3], amount: values[4], proposedSplit: { richard: values[5], anastasia: values[6], "jean-claude": values[7] } };
}

function parseExpense(text) {
  const values = parts(text.replace(/^\/expense(?:@\w+)?\s*/i, ""));
  if (values.length !== 5) throw new DomainError("Use: /expense REF | DESCRIPTION | Materials/Travel/Other | AMOUNT | A/B/Company overhead");
  return { reference: values[0], description: values[1], category: values[2], amount: values[3], proposedAllocation: values[4] };
}

export default async function handler(request, response) {
  try {
    requireMethod(request, ["POST"]);
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected) throw new DomainError("Telegram webhook is not configured.", 503, "NOT_CONFIGURED");
    const supplied = request.headers["x-telegram-bot-api-secret-token"];
    const validSecret = typeof supplied === "string" && supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    if (!validSecret) {
      throw new DomainError("Invalid webhook signature.", 401, "INVALID_WEBHOOK");
    }
    const update = await readBody(request);
    const message = update.message;
    if (!message?.text || message.chat?.type !== "private") return json(response, 200, { ignored: true });
    const user = message.from;
    const chatId = message.chat.id;
    await db.upsertContact({
      telegram_user_id: user.id,
      chat_id: chatId,
      username: user.username || null,
      display_name: [user.first_name, user.last_name].filter(Boolean).join(" ") || null,
      last_seen_at: new Date().toISOString()
    });
    const text = message.text.trim();
    if (/^\/(start|help)(?:@\w+)?/i.test(text)) {
      await sendMessage(chatId, help);
      return json(response, 200, { ok: true });
    }
    const employee = await db.getEmployeeByTelegramUser(user.id);
    if (!employee) {
      await sendMessage(chatId, "Your Telegram account is not linked. Ask Svetlana to link your user ID in Manager setup.");
      return json(response, 200, { ok: true, linked: false });
    }
    let result;
    try {
      if (/^\/sale(?:@\w+)?/i.test(text)) result = await submitSale(employee, parseSale(text), "telegram", chatId);
      else if (/^\/expense(?:@\w+)?/i.test(text)) result = await submitExpense(employee, parseExpense(text), "telegram", chatId);
      else throw new DomainError(`Unknown command.\n\n${help}`);
      const suffix = result.sheet.status === "Synced" ? "" : " Google Sheets sync is pending and can be retried by the manager.";
      await sendMessage(chatId, submissionMessage(result.item) + suffix);
    } catch (error) {
      await sendMessage(chatId, `Not recorded: ${error.message}`);
    }
    return json(response, 200, { ok: true });
  } catch (error) {
    return fail(response, error);
  }
}
