import { DomainError } from "./domain.js";

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DomainError("Supabase is not configured.", 503, "NOT_CONFIGURED");
  return { url, key };
}

async function request(path, options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: options.prefer || "return=representation",
      ...options.headers
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const duplicate = response.status === 409 || data?.code === "23505";
    throw new DomainError(duplicate ? "That reference already exists." : (data?.message || "Database operation failed."), duplicate ? 409 : response.status, duplicate ? "DUPLICATE_REFERENCE" : "DATABASE_ERROR");
  }
  return data;
}

export async function listEmployees() {
  return request("employees?select=id,slug,full_name,role,telegram_user_id,telegram_chat_id&active=eq.true&order=sort_order");
}

export async function getEmployeeBySlug(slug) {
  const rows = await request(`employees?select=*&slug=eq.${encodeURIComponent(slug)}&active=eq.true&limit=1`);
  return rows[0] || null;
}

export async function getEmployeeByTelegramUser(userId) {
  const rows = await request(`employees?select=*&telegram_user_id=eq.${encodeURIComponent(userId)}&active=eq.true&limit=1`);
  return rows[0] || null;
}

export async function listContacts() {
  return request("telegram_contacts?select=id,telegram_user_id,chat_id,username,display_name,last_seen_at&order=last_seen_at.desc");
}

export async function upsertContact(contact) {
  return request("telegram_contacts?on_conflict=telegram_user_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(contact)
  });
}

export async function linkTelegram(actorId, employeeId, telegramUserId, chatId) {
  return callRpc("link_telegram_employee", {
    p_actor_id: actorId,
    p_employee_id: employeeId,
    p_telegram_user_id: telegramUserId,
    p_chat_id: chatId
  });
}

export async function listTransactions() {
  return request("transactions?select=*,submitter:employees!submitter_id(full_name,slug,role)&order=submitted_at.desc");
}

export async function getTransaction(reference) {
  const rows = await request(`transactions?select=*,submitter:employees!submitter_id(full_name,slug,role)&reference=eq.${encodeURIComponent(reference)}&limit=1`);
  return rows[0] || null;
}

export async function insertTransaction(record) {
  const rows = await request("transactions", { method: "POST", body: JSON.stringify(record) });
  return rows[0];
}

export async function patchTransaction(reference, patch) {
  const rows = await request(`transactions?reference=eq.${encodeURIComponent(reference)}`, { method: "PATCH", body: JSON.stringify(patch) });
  return rows[0];
}

export async function callRpc(name, body) {
  return request(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}

export async function clearPracticeData(actorId) {
  return callRpc("clear_practice_data", { p_actor_id: actorId });
}
