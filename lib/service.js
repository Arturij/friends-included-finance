import { assertRole, calculateDashboard, DomainError, fromDatabase, ROLES, validateExpense, validateSale, validateSplit } from "./domain.js";
import * as db from "./supabase.js";
import { upsertTransaction } from "./sheets.js";
import { decisionMessage, sendMessage } from "./telegram.js";

function actorFrom(row) {
  return row ? { id: row.id, slug: row.slug, name: row.full_name, role: row.role } : null;
}

export async function getActor(slug) {
  const actor = actorFrom(await db.getEmployeeBySlug(slug));
  if (!actor) throw new DomainError("Select a valid demonstration role.", 401, "UNKNOWN_ROLE");
  return actor;
}

async function markSync(reference, status, error = null) {
  await db.patchTransaction(reference, { sheet_sync_status: status, sheet_sync_error: error, sheet_sync_attempted_at: new Date().toISOString() });
}

export async function syncSheet(reference) {
  const item = await db.getTransaction(reference);
  if (!item) throw new DomainError("Transaction not found.", 404, "NOT_FOUND");
  const claimed = await db.callRpc("claim_sheet_sync", { p_reference: reference });
  if (!claimed) {
    const current = await db.getTransaction(reference);
    return { status: current?.sheet_sync_status || item.sheet_sync_status, idempotent: true };
  }
  try {
    await upsertTransaction(item);
    await markSync(reference, "Synced");
    return { status: "Synced" };
  } catch (error) {
    await markSync(reference, "Sync failed", String(error.message || error).slice(0, 500));
    return { status: "Sync failed", error: error.message };
  }
}

export async function notifyDecision(reference) {
  const item = await db.getTransaction(reference);
  if (!item) throw new DomainError("Transaction not found.", 404, "NOT_FOUND");
  const decided = (item.kind === "sale" && item.status === "Approved") || (item.kind === "expense" && item.status === "Allocated");
  if (!decided) throw new DomainError("This transaction has no completed manager decision to notify.", 409, "DECISION_NOT_COMPLETE");
  if (item.notification_status === "Sent" || item.notification_status === "Not required") {
    return { status: item.notification_status, idempotent: true };
  }
  if (!item.notification_chat_id) {
    await db.patchTransaction(reference, { notification_status: "No recipient", notification_error: "No Telegram recipient linked", notification_attempted_at: new Date().toISOString() });
    return { status: "No recipient" };
  }
  const claimed = await db.callRpc("claim_notification", { p_reference: reference });
  if (!claimed) {
    const current = await db.getTransaction(reference);
    return { status: current?.notification_status || item.notification_status, idempotent: true };
  }
  try {
    await sendMessage(item.notification_chat_id, decisionMessage(item));
    await db.patchTransaction(reference, { notification_status: "Sent", notification_error: null, notification_attempted_at: new Date().toISOString() });
    return { status: "Sent" };
  } catch (error) {
    await db.patchTransaction(reference, { notification_status: "Failed", notification_error: String(error.message || error).slice(0, 500), notification_attempted_at: new Date().toISOString() });
    return { status: "Failed", error: error.message };
  }
}

export async function submitSale(actorRow, raw, origin = "website", sourceChatId = null) {
  const actor = actorFrom(actorRow);
  assertRole(actor, [ROLES.SALES], "submit a sale");
  const sale = validateSale(raw);
  await db.insertTransaction({
    reference: sale.reference,
    kind: "sale",
    status: "Pending approval",
    submitter_id: actor.id,
    customer: sale.customer,
    project: sale.project,
    description: sale.description,
    amount_cents: sale.amountCents,
    proposed_richard_pct: sale.proposedSplit.richard,
    proposed_anastasia_pct: sale.proposedSplit.anastasia,
    proposed_jean_claude_pct: sale.proposedSplit["jean-claude"],
    origin,
    source_chat_id: sourceChatId,
    notification_chat_id: sourceChatId || actorRow.telegram_chat_id || null,
    sheet_sync_status: "Sync pending",
    notification_status: sourceChatId || actorRow.telegram_chat_id ? "Not due" : "No recipient"
  });
  const sheet = await syncSheet(sale.reference);
  return { item: await db.getTransaction(sale.reference), sheet };
}

export async function submitExpense(actorRow, raw, origin = "website", sourceChatId = null) {
  const actor = actorFrom(actorRow);
  assertRole(actor, [ROLES.EXPENSE], "submit an expense");
  const expense = validateExpense(raw);
  const overhead = expense.proposedAllocation === "Company overhead";
  await db.insertTransaction({
    reference: expense.reference,
    kind: "expense",
    status: overhead ? "Allocated" : "Awaiting allocation",
    submitter_id: actor.id,
    description: expense.description,
    category: expense.category,
    amount_cents: expense.amountCents,
    proposed_allocation: expense.proposedAllocation,
    final_allocation: overhead ? "Company overhead" : null,
    decided_at: overhead ? new Date().toISOString() : null,
    origin,
    source_chat_id: sourceChatId,
    notification_chat_id: sourceChatId || actorRow.telegram_chat_id || null,
    sheet_sync_status: "Sync pending",
    notification_status: overhead ? "Not required" : (sourceChatId || actorRow.telegram_chat_id ? "Not due" : "No recipient")
  });
  const sheet = await syncSheet(expense.reference);
  return { item: await db.getTransaction(expense.reference), sheet };
}

export async function approveSale(actor, reference, split) {
  assertRole(actor, [ROLES.MANAGER], "approve a sale");
  const final = validateSplit(split);
  const changed = await db.callRpc("approve_sale", {
    p_actor_id: actor.id,
    p_reference: reference,
    p_richard_pct: final.richard,
    p_anastasia_pct: final.anastasia,
    p_jean_claude_pct: final["jean-claude"]
  });
  if (!changed) return { item: await db.getTransaction(reference), idempotent: true };
  const sheet = await syncSheet(reference);
  const notification = await notifyDecision(reference);
  return { item: await db.getTransaction(reference), sheet, notification };
}

export async function allocateExpense(actor, reference, allocation) {
  assertRole(actor, [ROLES.MANAGER], "allocate an expense");
  const changed = await db.callRpc("allocate_expense", { p_actor_id: actor.id, p_reference: reference, p_allocation: allocation });
  if (!changed) return { item: await db.getTransaction(reference), idempotent: true };
  const sheet = await syncSheet(reference);
  const notification = await notifyDecision(reference);
  return { item: await db.getTransaction(reference), sheet, notification };
}

export async function bootstrap(slug) {
  const [employees, rows] = await Promise.all([db.listEmployees(), db.listTransactions()]);
  const actor = slug ? employees.find((employee) => employee.slug === slug) : employees[0];
  if (!actor) throw new DomainError("No employees are configured.", 503, "NO_EMPLOYEES");
  const visible = actor.role === ROLES.MANAGER ? rows : rows.filter((row) => row.submitter_id === actor.id);
  const transactions = visible.map(fromDatabase);
  const allTransactions = rows.map(fromDatabase);
  return {
    actor: { id: actor.id, slug: actor.slug, name: actor.full_name, role: actor.role },
    employees: employees.map((employee) => ({ id: employee.id, slug: employee.slug, name: employee.full_name, role: employee.role, telegramLinked: Boolean(employee.telegram_user_id) })),
    transactions,
    dashboard: actor.role === ROLES.MANAGER ? calculateDashboard(allTransactions) : null,
    contacts: actor.role === ROLES.MANAGER ? await db.listContacts() : [],
    config: {
      studentName: process.env.STUDENT_NAME || "Student name",
      telegramBotUrl: process.env.TELEGRAM_BOT_URL || "",
      googleSheetUrl: process.env.GOOGLE_SHEET_URL || "",
      githubUrl: process.env.GITHUB_REPOSITORY_URL || ""
    }
  };
}

export async function linkTelegram(actor, employeeId, contact) {
  assertRole(actor, [ROLES.MANAGER], "link Telegram users");
  await db.linkTelegram(actor.id, employeeId, contact.telegram_user_id, contact.chat_id);
  return { linked: true };
}

export async function clearPractice(actor) {
  assertRole(actor, [ROLES.MANAGER], "clear practice data");
  await db.clearPracticeData(actor.id);
  return { cleared: true };
}
