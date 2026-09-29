import { formatMoney } from "./domain.js";

async function telegram(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.description || "Telegram delivery failed.");
  return data.result;
}

export async function sendMessage(chatId, text) {
  if (!chatId) throw new Error("No Telegram recipient linked.");
  return telegram("sendMessage", { chat_id: chatId, text });
}

export function submissionMessage(item) {
  const allocation = item.kind === "sale" ? `Project ${item.project}` : item.proposed_allocation;
  return `${item.kind === "sale" ? "Sale" : "Expense"} ${item.reference} recorded. Amount: ${formatMoney(item.amount_cents)}. ${allocation}. Status: ${item.status}.`;
}

export function decisionMessage(item) {
  if (item.kind === "sale") {
    const changed = item.proposed_richard_pct !== item.final_richard_pct || item.proposed_anastasia_pct !== item.final_anastasia_pct || item.proposed_jean_claude_pct !== item.final_jean_claude_pct;
    const before = changed ? ` Split changed from ${item.proposed_richard_pct}/${item.proposed_anastasia_pct}/${item.proposed_jean_claude_pct}.` : " Proposed split approved.";
    return `Sale ${item.reference} approved.${before} Sale ${formatMoney(item.amount_cents)}; total commission ${formatMoney(item.commission_pool_cents)}. Richard: ${item.final_richard_pct}% (${formatMoney(item.richard_earned_cents)}). Anastasia: ${item.final_anastasia_pct}% (${formatMoney(item.anastasia_earned_cents)}). Jean-Claude: ${item.final_jean_claude_pct}% (${formatMoney(item.jean_claude_earned_cents)}).`;
  }
  const changed = item.proposed_allocation !== item.final_allocation;
  return `Expense ${item.reference} — allocation ${changed ? "changed" : "confirmed"}. ${formatMoney(item.amount_cents)}: ${item.description}. Proposed: ${item.proposed_allocation}. Approved: ${item.final_allocation}.`;
}
