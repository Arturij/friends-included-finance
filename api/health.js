import { json } from "../lib/http.js";

export default function handler(_request, response) {
  const required = ["SUPABASE_URL", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_SHEET_ID"];
  const configured = Object.fromEntries(required.map((key) => [key, Boolean(process.env[key])]));
  configured.SUPABASE_SECRET_KEY = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  return json(response, 200, { ok: true, configured });
}
