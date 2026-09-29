import { DomainError } from "./domain.js";

export function json(response, status, body) {
  response.status(status).setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.send(JSON.stringify(body));
}

export function fail(response, error) {
  const status = error instanceof DomainError ? error.status : 500;
  const code = error instanceof DomainError ? error.code : "INTERNAL_ERROR";
  if (status === 500) console.error(error);
  return json(response, status, { error: status === 500 ? "The operation could not be completed." : error.message, code });
}

export async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function requireMethod(request, allowed) {
  if (!allowed.includes(request.method)) throw new DomainError("Method not allowed.", 405, "METHOD_NOT_ALLOWED");
}
