const state = { role: localStorage.getItem("friends-included-role") || "richard", data: null };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const euro = (cents) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(Number(cents || 0) / 100);

async function api(body) {
  const options = body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, role: state.role }) } : {};
  const response = await fetch(body ? "/api/app" : `/api/app?role=${encodeURIComponent(state.role)}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data;
}

function announce(message, error = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.toggle("error", error);
  notice.hidden = false;
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => { notice.hidden = true; }, 6500);
}

function metric(title, result, rows, company = false) {
  return `<article class="metric ${company ? "company" : ""}"><small>${escapeHtml(title)}</small><strong>${euro(result)}</strong><dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${euro(value)}</dd>`).join("")}</dl></article>`;
}

function renderDashboard() {
  const d = state.data.dashboard;
  if (!d) {
    $("#dashboard").hidden = true;
    $("#dashboard").innerHTML = "";
    return;
  }
  $("#dashboard").hidden = false;
  $("#dashboard").innerHTML = [
    metric("Project A result", d.projects.A.resultCents, [["Approved income", d.projects.A.incomeCents], ["Commission", d.projects.A.commissionCents], ["Allocated expenses", d.projects.A.expensesCents]]),
    metric("Project B result", d.projects.B.resultCents, [["Approved income", d.projects.B.incomeCents], ["Commission", d.projects.B.commissionCents], ["Allocated expenses", d.projects.B.expensesCents]]),
    metric("Company result", d.companyResultCents, [["Company overhead", d.overheadCents], ["Awaiting allocation", d.awaitingAllocationCents], ["All commission", d.totalCommissionCents]], true),
    metric("Commission earned", d.totalCommissionCents, [["Richard", d.commissions.richard], ["Anastasia", d.commissions.anastasia], ["Jean-Claude", d.commissions["jean-claude"]]])
  ].join("");
}

function renderIdentity() {
  const select = $("#role-select");
  select.innerHTML = state.data.employees.map((employee) => `<option value="${escapeHtml(employee.slug)}" ${employee.slug === state.role ? "selected" : ""}>${escapeHtml(employee.name)}</option>`).join("");
  const actor = state.data.actor;
  $("#welcome").textContent = `${actor.name} is viewing the latest saved position.`;
  const links = [["Telegram bot", state.data.config.telegramBotUrl], ["Google Sheets", state.data.config.googleSheetUrl], ["GitHub", state.data.config.githubUrl]].filter(([, url]) => url);
  $("#external-links").innerHTML = links.map(([label, url]) => `<a class="external-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label} ↗</a>`).join("");
  $("#student-name").textContent = state.data.config.studentName;
}

function renderEntry() {
  const role = state.data.actor.role;
  $("#sale-form").hidden = role !== "salesperson";
  $("#expense-form").hidden = role !== "expense_reporter";
  $("#no-entry").hidden = role !== "manager";
  $("#entry-guidance").textContent = role === "salesperson" ? "Submit a delivered, paid sale and propose how its 10% commission pool should be split." : role === "expense_reporter" ? "Record a paid expense and propose where it belongs." : "Review pending sales and expense allocations in Manager decisions.";
}

function decisionCard(item) {
  if (item.type === "sale") {
    return `<article class="decision" data-reference="${escapeHtml(item.reference)}"><div><h3>${escapeHtml(item.reference)} · ${euro(item.amountCents)}</h3><p>${escapeHtml(item.customer)} · Project ${escapeHtml(item.project)}</p><p class="meta">${escapeHtml(item.description)}</p></div><div class="proposal"><strong>Original proposal</strong><p>Richard ${item.proposedSplit.richard}% · Anastasia ${item.proposedSplit.anastasia}% · Jean-Claude ${item.proposedSplit["jean-claude"]}%</p></div><form class="controls approve-sale"><label>Richard %<input name="richard" type="number" min="0" max="100" value="${item.proposedSplit.richard}" required></label><label>Anastasia %<input name="anastasia" type="number" min="0" max="100" value="${item.proposedSplit.anastasia}" required></label><label>Jean-Claude %<input name="jeanClaude" type="number" min="0" max="100" value="${item.proposedSplit["jean-claude"]}" required></label><button class="primary">Approve sale</button></form></article>`;
  }
  return `<article class="decision" data-reference="${escapeHtml(item.reference)}"><div><h3>${escapeHtml(item.reference)} · ${euro(item.amountCents)}</h3><p>${escapeHtml(item.category)} · ${escapeHtml(item.description)}</p></div><div class="proposal"><strong>Original proposal</strong><p>${escapeHtml(item.proposedAllocation)}</p></div><form class="controls allocate-expense"><label>Final allocation<select name="allocation"><option value="A" ${item.proposedAllocation === "A" ? "selected" : ""}>Project A</option><option value="B" ${item.proposedAllocation === "B" ? "selected" : ""}>Project B</option><option ${item.proposedAllocation === "Company overhead" ? "selected" : ""}>Company overhead</option></select></label><button class="primary">Confirm allocation</button></form></article>`;
}

function renderDecisions() {
  const pending = state.data.transactions.filter((item) => item.status === "Pending approval" || item.status === "Awaiting allocation");
  $("#pending-count").textContent = pending.length;
  $("#decision-list").innerHTML = state.data.actor.role !== "manager" ? `<div class="empty">Only Svetlana can inspect and make manager decisions.</div>` : pending.length ? pending.map(decisionCard).join("") : `<div class="empty">There are no pending decisions.</div>`;
}

function pill(value) {
  const good = ["Approved", "Allocated", "Synced", "Sent", "Not required"].includes(value);
  const bad = ["Sync failed", "Failed", "No recipient"].includes(value);
  return `<span class="pill ${good ? "good" : bad ? "bad" : ""}">${escapeHtml(value)}</span>`;
}

function detail(item) {
  if (item.type === "sale") {
    const proposed = `${item.proposedSplit.richard}/${item.proposedSplit.anastasia}/${item.proposedSplit["jean-claude"]}%`;
    const final = item.finalSplit ? `${item.finalSplit.richard}/${item.finalSplit.anastasia}/${item.finalSplit["jean-claude"]}%` : "Not decided";
    return `<strong>Sale · Project ${escapeHtml(item.project)}</strong><br><small>${escapeHtml(item.customer)} · Proposed ${proposed} · Final ${final}</small>`;
  }
  return `<strong>Expense · ${escapeHtml(item.category)}</strong><br><small>Proposed ${escapeHtml(item.proposedAllocation)} · Final ${escapeHtml(item.finalAllocation || "Not decided")}</small>`;
}

function renderRecords() {
  const manager = state.data.actor.role === "manager";
  $("#records-body").innerHTML = state.data.transactions.length ? state.data.transactions.map((item) => `<tr><td><strong>${escapeHtml(item.reference)}</strong><br><small>${escapeHtml(item.submitterName || "")}</small></td><td>${detail(item)}</td><td>${euro(item.amountCents)}</td><td>${pill(item.status)}</td><td>${pill(item.sheetSyncStatus || "Sync pending")}</td><td>${pill(item.notificationStatus || "Not due")}</td><td><div class="row-actions">${manager && item.sheetSyncStatus !== "Synced" ? `<button data-action="retry_sheet" data-ref="${escapeHtml(item.reference)}">Retry Sheets</button>` : ""}${manager && item.notificationStatus === "Failed" ? `<button data-action="retry_notification" data-ref="${escapeHtml(item.reference)}">Retry Telegram</button>` : ""}</div></td></tr>`).join("") : `<tr><td colspan="7"><div class="empty">No transactions yet.</div></td></tr>`;
}

function renderSetup() {
  const manager = state.data.actor.role === "manager";
  const panel = $('[data-panel="setup"]');
  $("#link-form").hidden = !manager;
  $(".danger-zone", panel).hidden = !manager;
  if (!manager) return;
  const contactSelect = $('#link-form [name="contact"]');
  contactSelect.innerHTML = state.data.contacts.length ? state.data.contacts.map((contact, index) => `<option value="${index}">${escapeHtml(contact.display_name || contact.username || contact.telegram_user_id)} · ${escapeHtml(contact.telegram_user_id)}</option>`).join("") : `<option value="">No bot contacts observed</option>`;
  $('#link-form [name="employee"]').innerHTML = state.data.employees.map((employee) => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)}${employee.telegramLinked ? " · linked" : ""}</option>`).join("");
}

function render() {
  renderIdentity(); renderDashboard(); renderEntry(); renderDecisions(); renderRecords(); renderSetup();
}

async function load() {
  try {
    $("#fatal").hidden = true;
    state.data = await api();
    render();
  } catch (error) {
    $("#fatal-message").textContent = error.message;
    $("#fatal").hidden = false;
    $("#dashboard").innerHTML = "";
  }
}

async function act(body, success) {
  try {
    await api(body);
    announce(success);
    await load();
  } catch (error) {
    announce(error.message, true);
  }
}

$("#role-select").addEventListener("change", (event) => {
  state.role = event.target.value;
  localStorage.setItem("friends-included-role", state.role);
  load();
});

$$('.tab').forEach((button) => button.addEventListener("click", () => {
  $$('.tab').forEach((tab) => { tab.classList.toggle("active", tab === button); tab.setAttribute("aria-selected", String(tab === button)); });
  $$('.tab-panel').forEach((panel) => { panel.hidden = panel.dataset.panel !== button.dataset.tab; });
}));

$("#sale-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  await act({ action: "submit_sale", sale: { ...data, proposedSplit: { richard: data.richard, anastasia: data.anastasia, "jean-claude": data.jeanClaude } } }, `Sale ${data.reference.toUpperCase()} recorded.`);
});

$("#expense-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const expense = Object.fromEntries(new FormData(event.currentTarget));
  await act({ action: "submit_expense", expense }, `Expense ${expense.reference.toUpperCase()} recorded.`);
});

$("#decision-list").addEventListener("submit", async (event) => {
  event.preventDefault();
  const card = event.target.closest("[data-reference]");
  const data = Object.fromEntries(new FormData(event.target));
  if (event.target.classList.contains("approve-sale")) await act({ action: "approve_sale", reference: card.dataset.reference, split: { richard: data.richard, anastasia: data.anastasia, "jean-claude": data.jeanClaude } }, `${card.dataset.reference} approved.`);
  else await act({ action: "allocate_expense", reference: card.dataset.reference, allocation: data.allocation }, `${card.dataset.reference} allocated.`);
});

$("#records-body").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) await act({ action: button.dataset.action, reference: button.dataset.ref }, `${button.dataset.ref} retry completed.`);
});

$("#link-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const contact = state.data.contacts[Number(data.contact)];
  if (!contact) return announce("Ask the user to start the Telegram bot first.", true);
  await act({ action: "link_telegram", employeeId: data.employee, contact }, "Telegram account linked.");
});

$("#clear-button").addEventListener("click", async () => {
  if (confirm("Delete every transaction? Use this only before Test 1.")) await act({ action: "clear_practice" }, "Practice transactions cleared.");
});

load();
