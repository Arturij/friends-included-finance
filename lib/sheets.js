import { createSign } from "node:crypto";
import { DomainError } from "./domain.js";

const SALES_HEADERS = ["Reference", "Submission time", "Salesperson", "Customer", "Project", "Description", "Amount", "Original Richard %", "Original Anastasia %", "Original Jean-Claude %", "Approved Richard %", "Approved Anastasia %", "Approved Jean-Claude %", "Richard earned", "Anastasia earned", "Jean-Claude earned", "Status"];
const EXPENSE_HEADERS = ["Reference", "Submission time", "Reporter", "Description", "Category", "Amount", "Proposed allocation", "Final allocation", "Status"];

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey || !process.env.GOOGLE_SHEET_ID) throw new DomainError("Google Sheets is not configured.", 503, "NOT_CONFIGURED");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Google authentication failed.");
  return data.access_token;
}

async function sheetsRequest(path, options = {}) {
  const token = await accessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}/${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...options.headers }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Google Sheets update failed.");
  return data;
}

function formatEuro(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function transactionRow(item) {
  if (item.kind === "sale") {
    return [item.reference, item.submitted_at, item.submitter?.full_name || item.submitter_name || "", item.customer, item.project, item.description, formatEuro(item.amount_cents), item.proposed_richard_pct, item.proposed_anastasia_pct, item.proposed_jean_claude_pct, item.final_richard_pct ?? "", item.final_anastasia_pct ?? "", item.final_jean_claude_pct ?? "", formatEuro(item.richard_earned_cents), formatEuro(item.anastasia_earned_cents), formatEuro(item.jean_claude_earned_cents), item.status];
  }
  return [item.reference, item.submitted_at, item.submitter?.full_name || item.submitter_name || "", item.description, item.category, formatEuro(item.amount_cents), item.proposed_allocation, item.final_allocation || "", item.status];
}

export async function upsertTransaction(item) {
  const tab = item.kind === "sale" ? "Sales" : "Expenses";
  const headers = item.kind === "sale" ? SALES_HEADERS : EXPENSE_HEADERS;
  const encodedHeaderRange = encodeURIComponent(`'${tab}'!A1:${String.fromCharCode(64 + headers.length)}1`);
  await sheetsRequest(`values/${encodedHeaderRange}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) });
  const refs = await sheetsRequest(`values/${encodeURIComponent(`'${tab}'!A2:A`)}`);
  const rowIndex = (refs.values || []).findIndex((row) => row[0] === item.reference);
  const values = [transactionRow(item)];
  if (rowIndex >= 0) {
    const rowNumber = rowIndex + 2;
    const range = encodeURIComponent(`'${tab}'!A${rowNumber}:${String.fromCharCode(64 + headers.length)}${rowNumber}`);
    await sheetsRequest(`values/${range}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values }) });
    return { operation: "updated", row: rowNumber };
  }
  await sheetsRequest(`values/${encodeURIComponent(`'${tab}'!A:${String.fromCharCode(64 + headers.length)}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values }) });
  return { operation: "appended" };
}
