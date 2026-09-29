export const ROLES = Object.freeze({ MANAGER: "manager", SALES: "salesperson", EXPENSE: "expense_reporter" });
export const PROJECTS = Object.freeze(["A", "B"]);
export const EXPENSE_CATEGORIES = Object.freeze(["Materials", "Travel", "Other"]);
export const ALLOCATIONS = Object.freeze(["A", "B", "Company overhead"]);
export const SALESPEOPLE = Object.freeze(["richard", "anastasia", "jean-claude"]);

export class DomainError extends Error {
  constructor(message, status = 400, code = "INVALID_REQUEST") {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
  }
}

export function assertRole(actor, allowed, action) {
  if (!actor || !allowed.includes(actor.role)) {
    throw new DomainError(`${actor?.name || "This role"} cannot ${action}.`, 403, "FORBIDDEN");
  }
}

export function moneyToCents(value) {
  const normalized = String(value ?? "").replace(/[€,\s]/g, "");
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new DomainError("Amount must be a positive euro value with at most two decimal places.");
  }
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0") || "0");
  if (cents <= 0n) {
    throw new DomainError("Amount must be greater than zero.");
  }
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainError("Amount is too large.");
  }
  return Number(cents);
}

export function formatMoney(cents) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function validateReference(reference, type) {
  const ref = String(reference || "").trim().toUpperCase();
  if (!ref) throw new DomainError("Reference is required.");
  if (!/^[A-Z0-9-]{2,24}$/.test(ref)) throw new DomainError("Reference must use 2–24 letters, numbers, or hyphens.");
  const expected = type === "sale" ? "S" : "E";
  if (!ref.startsWith(expected)) throw new DomainError(`${type === "sale" ? "Sale" : "Expense"} references must start with ${expected}.`);
  return ref;
}

export function validateSplit(split) {
  const basisPoints = SALESPEOPLE.map((key) => {
    const raw = String(split?.[key] ?? "").trim();
    const match = raw.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
    if (!match) throw new DomainError("Commission shares may use at most two decimal places.");
    const result = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0") || "0");
    if (result < 0 || result > 10000) throw new DomainError("Each commission share must be between 0% and 100%.");
    return result;
  });
  if (basisPoints.reduce((sum, value) => sum + value, 0) !== 10000) {
    throw new DomainError("Commission shares must total exactly 100%.");
  }
  return Object.fromEntries(SALESPEOPLE.map((key, index) => [key, basisPoints[index] / 100]));
}

export function calculateCommission(amountCents, rawSplit) {
  const split = validateSplit(rawSplit);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new DomainError("Amount must be a positive integer number of cents.");
  const amount = BigInt(amountCents);
  const poolCents = Number((amount + 5n) / 10n);
  const earned = Object.fromEntries(SALESPEOPLE.map((key) => {
    const basisPoints = BigInt(Math.round(split[key] * 100));
    return [key, Number((BigInt(poolCents) * basisPoints + 5000n) / 10000n)];
  }));
  const allocated = Object.values(earned).reduce((sum, value) => sum + value, 0);
  const difference = poolCents - allocated;
  if (difference) {
    const winner = SALESPEOPLE.reduce((best, key) => split[key] > split[best] ? key : best, SALESPEOPLE[0]);
    earned[winner] += difference;
  }
  return { poolCents, earned, split };
}

export function validateSale(input) {
  const project = String(input.project || "").toUpperCase();
  if (!PROJECTS.includes(project)) throw new DomainError("Project must be A or B.");
  const customer = String(input.customer || "").trim();
  const description = String(input.description || "").trim();
  if (!customer) throw new DomainError("Customer is required.");
  if (!description) throw new DomainError("Description is required.");
  return {
    reference: validateReference(input.reference, "sale"),
    customer,
    description,
    project,
    amountCents: moneyToCents(input.amount),
    proposedSplit: validateSplit(input.proposedSplit)
  };
}

export function validateExpense(input) {
  const description = String(input.description || "").trim();
  if (!description) throw new DomainError("Description is required.");
  if (!EXPENSE_CATEGORIES.includes(input.category)) throw new DomainError("Select Materials, Travel, or Other.");
  if (!ALLOCATIONS.includes(input.proposedAllocation)) throw new DomainError("Select project A, project B, or Company overhead.");
  return {
    reference: validateReference(input.reference, "expense"),
    description,
    category: input.category,
    amountCents: moneyToCents(input.amount),
    proposedAllocation: input.proposedAllocation
  };
}

function blankProject() {
  return { incomeCents: 0, commissionCents: 0, expensesCents: 0, resultCents: 0 };
}

export function calculateDashboard(transactions) {
  const projects = { A: blankProject(), B: blankProject() };
  const commissions = { richard: 0, anastasia: 0, "jean-claude": 0 };
  let overheadCents = 0;
  let awaitingAllocationCents = 0;
  let totalApprovedSalesCents = 0;
  let totalCommissionCents = 0;
  let totalExpensesCents = 0;

  for (const item of transactions) {
    if (item.type === "sale" && item.status === "Approved") {
      const project = projects[item.project];
      project.incomeCents += item.amountCents;
      project.commissionCents += item.commissionPoolCents;
      totalApprovedSalesCents += item.amountCents;
      totalCommissionCents += item.commissionPoolCents;
      for (const key of SALESPEOPLE) commissions[key] += item.earned?.[key] || 0;
    }
    if (item.type === "expense") {
      totalExpensesCents += item.amountCents;
      if (item.status === "Awaiting allocation") awaitingAllocationCents += item.amountCents;
      else if (item.finalAllocation === "Company overhead") overheadCents += item.amountCents;
      else if (PROJECTS.includes(item.finalAllocation)) projects[item.finalAllocation].expensesCents += item.amountCents;
    }
  }
  for (const project of Object.values(projects)) {
    project.resultCents = project.incomeCents - project.commissionCents - project.expensesCents;
  }
  return {
    projects,
    overheadCents,
    awaitingAllocationCents,
    companyResultCents: totalApprovedSalesCents - totalCommissionCents - totalExpensesCents,
    totalApprovedSalesCents,
    totalCommissionCents,
    totalExpensesCents,
    commissions
  };
}

export function fromDatabase(row) {
  return {
    id: row.id,
    reference: row.reference,
    type: row.kind,
    status: row.status,
    submitterId: row.submitter_id,
    submitterName: row.submitter?.full_name || row.submitter_name,
    customer: row.customer,
    project: row.project,
    description: row.description,
    category: row.category,
    amountCents: Number(row.amount_cents),
    proposedAllocation: row.proposed_allocation,
    finalAllocation: row.final_allocation,
    proposedSplit: row.kind === "sale" ? {
      richard: row.proposed_richard_pct,
      anastasia: row.proposed_anastasia_pct,
      "jean-claude": row.proposed_jean_claude_pct
    } : null,
    finalSplit: row.kind === "sale" && row.final_richard_pct != null ? {
      richard: row.final_richard_pct,
      anastasia: row.final_anastasia_pct,
      "jean-claude": row.final_jean_claude_pct
    } : null,
    commissionPoolCents: Number(row.commission_pool_cents || 0),
    earned: {
      richard: Number(row.richard_earned_cents || 0),
      anastasia: Number(row.anastasia_earned_cents || 0),
      "jean-claude": Number(row.jean_claude_earned_cents || 0)
    },
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    origin: row.origin,
    sheetSyncStatus: row.sheet_sync_status,
    notificationStatus: row.notification_status,
    notificationTarget: row.notification_chat_id
  };
}
