import test from "node:test";
import assert from "node:assert/strict";
import { assertRole, calculateCommission, calculateDashboard, DomainError, moneyToCents, ROLES, validateExpense, validateSale, validateSplit } from "../lib/domain.js";

const earned = (richard, anastasia, jeanClaude) => ({ richard, anastasia, "jean-claude": jeanClaude });
const sale = (reference, project, amountCents, pool, commissions, status = "Approved") => ({ reference, type: "sale", project, amountCents, commissionPoolCents: pool, earned: commissions, status });
const expense = (reference, amountCents, finalAllocation, status = "Allocated") => ({ reference, type: "expense", amountCents, finalAllocation, status });

const test1 = [
  sale("S01", "A", 100000, 10000, earned(5000, 3000, 2000)),
  sale("S02", "B", 200000, 20000, earned(4000, 8000, 8000)),
  expense("E01", 12000, "A"),
  expense("E02", 8000, "A"),
  expense("E03", 10000, "Company overhead")
];

const test2Additions = [
  sale("S03", "A", 150000, 15000, earned(3000, 4500, 7500)),
  sale("S04", "B", 80000, 8000, earned(2000, 2000, 4000)),
  sale("S05", "B", 60000, 0, earned(0, 0, 0), "Pending approval"),
  expense("E04", 25000, "B"),
  expense("E05", 9000, "B"),
  expense("E06", 6000, "Company overhead"),
  expense("E07", 14000, null, "Awaiting allocation")
];

test("Test 1 control totals match the assignment", () => {
  const result = calculateDashboard(test1);
  assert.deepEqual(result.projects.A, { incomeCents: 100000, commissionCents: 10000, expensesCents: 20000, resultCents: 70000 });
  assert.deepEqual(result.projects.B, { incomeCents: 200000, commissionCents: 20000, expensesCents: 0, resultCents: 180000 });
  assert.equal(result.overheadCents, 10000);
  assert.equal(result.awaitingAllocationCents, 0);
  assert.equal(result.companyResultCents, 240000);
  assert.deepEqual(result.commissions, earned(9000, 11000, 10000));
});

test("Test 2 cumulative totals match the assignment", () => {
  const result = calculateDashboard([...test1, ...test2Additions]);
  assert.deepEqual(result.projects.A, { incomeCents: 250000, commissionCents: 25000, expensesCents: 20000, resultCents: 205000 });
  assert.deepEqual(result.projects.B, { incomeCents: 280000, commissionCents: 28000, expensesCents: 34000, resultCents: 218000 });
  assert.equal(result.totalApprovedSalesCents, 530000);
  assert.equal(result.totalCommissionCents, 53000);
  assert.equal(result.overheadCents, 16000);
  assert.equal(result.awaitingAllocationCents, 14000);
  assert.equal(result.totalExpensesCents, 84000);
  assert.equal(result.companyResultCents, 393000);
  assert.deepEqual(result.commissions, earned(14000, 17500, 21500));
  assert.equal(result.projects.A.resultCents + result.projects.B.resultCents - result.overheadCents - result.awaitingAllocationCents, result.companyResultCents);
});

test("pending sales do not affect income or commission", () => {
  const result = calculateDashboard([sale("S99", "A", 99900, 9990, earned(9990, 0, 0), "Pending approval")]);
  assert.equal(result.companyResultCents, 0);
  assert.equal(result.totalCommissionCents, 0);
});

test("awaiting expenses reduce company but not project result", () => {
  const result = calculateDashboard([expense("E99", 14000, null, "Awaiting allocation")]);
  assert.equal(result.companyResultCents, -14000);
  assert.equal(result.projects.A.resultCents, 0);
  assert.equal(result.projects.B.resultCents, 0);
});

test("commission remainder follows largest share and tie priority", () => {
  assert.deepEqual(calculateCommission(11, { richard: 33, anastasia: 33, "jean-claude": 34 }), { poolCents: 1, split: { richard: 33, anastasia: 33, "jean-claude": 34 }, earned: earned(0, 0, 1) });
  assert.deepEqual(calculateCommission(11, { richard: 50, anastasia: 50, "jean-claude": 0 }).earned, earned(0, 1, 0));
});

test("validation rejects invalid totals, amounts, and missing fields", () => {
  assert.throws(() => validateSplit({ richard: 60, anastasia: 30, "jean-claude": 20 }), /exactly 100/);
  assert.throws(() => moneyToCents(0), /greater than zero/);
  assert.equal(moneyToCents("€1,000.05"), 100005);
  assert.equal(moneyToCents("0.01"), 1);
  assert.throws(() => moneyToCents("1.001"), /two decimal places/);
  assert.throws(() => moneyToCents("1e3"), /two decimal places/);
  assert.throws(() => validateExpense({ reference: "E01", description: "x", category: "Other", amount: "", proposedAllocation: "A" }), DomainError);
  assert.throws(() => validateSale({ reference: "S01", customer: "", project: "A", description: "x", amount: 100, proposedSplit: { richard: 50, anastasia: 30, "jean-claude": 20 } }), /Customer/);
  assert.deepEqual(validateSplit({ richard: 33.33, anastasia: 33.33, "jean-claude": 33.34 }), { richard: 33.33, anastasia: 33.33, "jean-claude": 33.34 });
  assert.throws(() => validateSplit({ richard: 33.333, anastasia: 33.333, "jean-claude": 33.334 }), /two decimal places/);
});

test("permissions are enforced independently of the interface", () => {
  assert.throws(() => assertRole({ name: "Richard", role: ROLES.SALES }, [ROLES.MANAGER], "approve a sale"), /cannot approve/);
  assert.throws(() => assertRole({ name: "Kevin", role: ROLES.EXPENSE }, [ROLES.SALES], "submit a sale"), /cannot submit/);
  assert.doesNotThrow(() => assertRole({ name: "Svetlana", role: ROLES.MANAGER }, [ROLES.MANAGER], "approve a sale"));
});
