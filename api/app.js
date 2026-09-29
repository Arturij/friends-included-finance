import { fail, json, readBody, requireMethod } from "../lib/http.js";
import { ALLOCATIONS, assertRole, DomainError, ROLES } from "../lib/domain.js";
import * as db from "../lib/supabase.js";
import * as service from "../lib/service.js";

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      return json(response, 200, await service.bootstrap(request.query?.role || "richard"));
    }
    requireMethod(request, ["POST"]);
    const body = await readBody(request);
    const actorRow = await db.getEmployeeBySlug(body.role);
    if (!actorRow) throw new DomainError("Select a valid demonstration role.", 401, "UNKNOWN_ROLE");
    const actor = { id: actorRow.id, slug: actorRow.slug, name: actorRow.full_name, role: actorRow.role };
    let result;
    switch (body.action) {
      case "submit_sale":
        result = await service.submitSale(actorRow, body.sale);
        break;
      case "submit_expense":
        result = await service.submitExpense(actorRow, body.expense);
        break;
      case "approve_sale":
        result = await service.approveSale(actor, body.reference, body.split);
        break;
      case "allocate_expense":
        if (!ALLOCATIONS.includes(body.allocation)) throw new DomainError("Choose a valid allocation.");
        result = await service.allocateExpense(actor, body.reference, body.allocation);
        break;
      case "retry_sheet":
        assertRole(actor, [ROLES.MANAGER], "retry Google Sheets synchronization");
        result = await service.syncSheet(body.reference);
        break;
      case "retry_notification":
        assertRole(actor, [ROLES.MANAGER], "retry Telegram notifications");
        result = await service.notifyDecision(body.reference);
        break;
      case "link_telegram":
        result = await service.linkTelegram(actor, body.employeeId, body.contact);
        break;
      case "clear_practice":
        result = await service.clearPractice(actor);
        break;
      default:
        throw new DomainError("Unknown action.");
    }
    return json(response, 200, result);
  } catch (error) {
    return fail(response, error);
  }
}
