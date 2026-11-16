// CareFlow classroom frontend: plain HTML is in index.html, styling in style.css,
// and this JavaScript file connects the screens to the hospital REST API.
const API_BASE = import.meta.env.VITE_API_URL || "";
const app = document.querySelector("#app");
let token = sessionStorage.getItem("careflow-token") || "";
let user = JSON.parse(sessionStorage.getItem("careflow-user") || "null");
let activeView = "overview";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (value, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(value || 0));
function notify(message, isError = false) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 4000);
}
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401 && token) { signOut(); throw new Error("Your sign-in expired. Please sign in again."); }
  if (!response.ok) throw new Error(result.detail || `Request failed (${response.status})`);
  return result;
}
function signOut() {
  sessionStorage.removeItem("careflow-token");
  sessionStorage.removeItem("careflow-user");
  token = ""; user = null; activeView = "overview"; renderLogin();
}
function renderLogin(error = "") {
  app.innerHTML = `<main class="login-page"><section class="login-card">
    <div class="brand"><span class="brand-mark">✚</span><span>CareFlow<small>HOSPITAL MANAGEMENT</small></span></div>
    <div class="eyebrow">Welcome</div><h1>Sign in to CareFlow</h1>
    <p class="intro">Use your individual CareFlow account to open the correct workspace.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    <form id="login-form"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required value="admin@hospital.demo">
    <label for="password">CareFlow password</label><input id="password" name="password" type="password" autocomplete="current-password" required value="ChangeMe123!">
    <button class="button primary" type="submit">Sign in</button></form>
    <div class="demo-note"><strong>Local demo login</strong><br>admin@hospital.demo<br>ChangeMe123!<br>Use fictional data only.</div>
  </section></main>`;
  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      token = result.access_token; user = result.user;
      sessionStorage.setItem("careflow-token", token); sessionStorage.setItem("careflow-user", JSON.stringify(user));
      activeView = user.role === "patient" ? "patient" : "overview"; render();
    } catch (error) { renderLogin(error.message); }
  });
}
const allNav = [
  ["overview", "Overview", "admin,reception,clinician,lab,pharmacy,billing"],
  ["patients", "Patients", "admin,reception,clinician,lab,pharmacy,billing"],
  ["appointments", "Appointments", "admin,reception,clinician"],
  ["clinical", "Clinical records", "admin,clinician"],
  ["assistant", "AI Assistant Demo", "admin,clinician"],
  ["laboratory", "Laboratory", "admin,lab,clinician"],
  ["pharmacy", "Pharmacy", "admin,pharmacy,clinician"],
  ["billing", "Billing", "admin,billing,reception"],
  ["staff", "Staff accounts", "admin"],
  ["patient", "My health", "patient"],
];
function render() {
  if (!token || !user) return renderLogin();
  const nav = allNav.filter(([, , roles]) => roles.split(",").includes(user.role));
  if (!nav.some(([id]) => id === activeView)) activeView = nav[0]?.[0] || "overview";
  app.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">✚</span><span>CareFlow<small>HOSPITAL MANAGEMENT</small></span></div>
    <div class="hospital-name">City General Hospital</div><div id="navigation">${nav.map(([id, label]) => `<button class="nav-button ${id === activeView ? "active" : ""}" data-view="${id}">${label}</button>`).join("")}</div>
    </aside><main class="main"><header class="topbar"><strong>${escapeHtml(viewTitle(activeView))}</strong><div class="top-actions"><span>${escapeHtml(user.full_name)} · ${escapeHtml(user.role)}</span><button id="logout">Sign out</button></div></header><section class="content" id="page"></section></main></div>`;
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { activeView = button.dataset.view; render(); }));
  document.querySelector("#logout").addEventListener("click", signOut);
  loadPage();
}
function viewTitle(view) { return Object.fromEntries(allNav.map(([id, label]) => [id, label]))[view] || "Overview"; }
function pageHeader(title, description, eyebrow = "CAREFLOW") { return `<div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="intro">${description}</p>`; }
function table(items, columns) {
  if (!items.length) return `<p class="empty">No records to show yet.</p>`;
  return `<div class="table-wrap"><table><thead><tr>${columns.map(([, label]) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${items.map((item) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(item[key] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
async function loadPage() {
  const page = document.querySelector("#page");
  if (!page) return;
  page.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    if (activeView === "overview") {
      const summary = await request("/analytics/summary");
      page.innerHTML = `${pageHeader("Good morning, care team", "A live view of hospital operations and saved demo records.", "HOSPITAL OVERVIEW")}
        <div class="metrics">${metric("Registered patients", summary.patients_total)}${metric("Appointments today", summary.appointments_today)}${metric("Lab work in progress", summary.pending_labs)}${metric("Outstanding balance", money(summary.outstanding_balance, summary.currency || "INR"))}</div>
        <div class="grid-two"><section class="panel"><h2>Today's schedule</h2>${table(summary.recent_appointments || [], [["patient_name", "Patient"], ["provider_name", "Provider"], ["status", "Status"]])}</section>
        <section class="panel"><h2>Department activity</h2>${table(summary.department_activity || [], [["department", "Department"], ["appointments", "Appointments"]])}</section></div>`;
    } else if (activeView === "patient") {
      const data = await request("/patient-portal"); const p = data.patient;
      page.innerHTML = `${pageHeader("My health", "Your profile, appointments, visit records, test results, prescriptions and bills.", "PATIENT PORTAL")}
        <section class="panel"><h2>My profile</h2><div class="grid-two"><p><strong>Name:</strong> ${escapeHtml(p.full_name)}</p><p><strong>Record number:</strong> ${escapeHtml(p.medical_record_number)}</p><p><strong>Date of birth:</strong> ${escapeHtml(p.date_of_birth)}</p><p><strong>Blood group:</strong> ${escapeHtml(p.blood_group)}</p><p><strong>Phone:</strong> ${escapeHtml(p.phone || "Not provided")}</p><p><strong>Email:</strong> ${escapeHtml(p.email || data.login_email)}</p><p><strong>Allergies:</strong> ${escapeHtml(p.allergies || "None recorded")}</p><p><strong>Address:</strong> ${escapeHtml(p.address || "Not provided")}</p></div></section>
        ${portalTable("Appointments", data.appointments, [["provider_name", "Provider"], ["scheduled_at", "Date"], ["reason", "Reason"], ["status", "Status"]])}
        ${portalTable("Visit records", data.encounters, [["chief_complaint", "Reason"], ["clinician_assessment", "Assessment"], ["plan", "Care plan"]])}
        ${portalTable("Lab results", data.labs, [["test_name", "Test"], ["status", "Status"], ["result", "Result"]])}
        ${portalTable("Prescriptions", data.prescriptions, [["medication_name", "Medicine"], ["dosage", "Dosage"], ["frequency", "Frequency"], ["status", "Status"]])}
        ${portalTable("Bills", data.invoices, [["created_at", "Date"], ["status", "Status"], ["total", "Total"]])}`;
    } else if (activeView === "assistant") {
      page.innerHTML = `${pageHeader("AI Assistant Demo", "Prepared examples show how an assistant might help staff write a hand-off.", "AI SUPPORT")}
        <section class="panel"><h2>Choose a sample prompt</h2><p class="muted">This classroom demo uses prepared replies. It does not connect to a live AI model or make clinical decisions.</p>
        <div class="list"><button class="button ai-prompt" data-answer="A hand-off summary can list recent notes, active prescriptions and pending tests for a clinician to check.">Prepare a hand-off summary</button>
        <button class="button ai-prompt" data-answer="A staff reminder can say: please review the latest saved chart and confirm pending results before the next visit.">Draft a staff reminder</button>
        <button class="button ai-prompt" data-answer="CareFlow can collect information already recorded in the chart. A qualified clinician must check it; the demo does not diagnose or recommend treatment.">What are the safety limits?</button></div><div id="answer" class="panel muted">Choose a prompt to see the prepared response.</div></section>`;
      document.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => { document.querySelector("#answer").textContent = button.dataset.answer; }));
    } else if (activeView === "staff") {
      const [users, patients] = await Promise.all([request("/users"), request("/patients")]);
      page.innerHTML = `${pageHeader("Hospital accounts", "Create separate sign-ins and assign each account a role.", "ADMINISTRATION")}
        <section class="panel"><h2>Create an account</h2><form id="account-form" class="form-grid">
          <div><label>Name</label><input name="full_name" minlength="2" required></div><div><label>Email to sign in</label><input name="email" type="email" required></div>
          <div><label>Role</label><select name="role"><option value="reception">Reception</option><option value="clinician">Clinician</option><option value="lab">Laboratory</option><option value="pharmacy">Pharmacy</option><option value="billing">Billing</option><option value="admin">Administrator</option><option value="patient">Patient portal</option></select></div>
          <div><label>Initial CareFlow password (12+ characters)</label><input name="password" type="password" minlength="12" required></div>
          <div class="wide" id="patient-choice" hidden><label>Link to registered patient</label><select name="patient_id"><option value="">Choose patient</option>${patients.map((p) => `<option value="${p.id}">${escapeHtml(p.full_name)} · ${escapeHtml(p.medical_record_number)}</option>`).join("")}</select></div>
          <div class="wide"><button class="button primary" type="submit">Create account</button></div></form></section>
          <section class="panel"><h2>Current accounts</h2>${table(users, [["full_name", "Name"], ["email", "Sign-in email"], ["role", "Role"], ["active", "Active"]])}</section>`;
      const role = document.querySelector("[name=role]"); role.addEventListener("change", () => { document.querySelector("#patient-choice").hidden = role.value !== "patient"; });
      document.querySelector("#account-form").addEventListener("submit", createAccount);
    } else {
      const route = { patients: "/patients", appointments: "/appointments", clinical: "/encounters", laboratory: "/labs", pharmacy: "/medications", billing: "/invoices" }[activeView];
      const items = await request(route);
      const columns = items.length ? Object.keys(items[0]).filter((key) => !["id", "patient_id", "provider_id", "created_at", "updated_at", "lines"].includes(key)).slice(0, 5).map((key) => [key, key.replaceAll("_", " ")]) : [];
      page.innerHTML = `${pageHeader(viewTitle(activeView), "Hospital records for your assigned workspace.", "WORKSPACE")}<section class="panel">${table(items, columns)}</section>`;
    }
  } catch (error) { page.innerHTML = `<section class="panel error"><strong>Could not load this page</strong><p>${escapeHtml(error.message)}</p><button class="button" id="retry">Try again</button></section>`; document.querySelector("#retry").addEventListener("click", loadPage); }
}
function metric(label, value) { return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${escapeHtml(value)}</div></div>`; }
function portalTable(title, items, columns) { return `<section class="panel"><h2>${title}</h2>${table(items || [], columns)}</section>`; }
async function createAccount(event) {
  event.preventDefault(); const data = new FormData(event.currentTarget); const role = data.get("role");
  const body = { full_name: data.get("full_name"), email: data.get("email"), password: data.get("password"), role };
  if (role === "patient") { if (!data.get("patient_id")) return notify("Choose the patient record to link.", true); body.patient_id = Number(data.get("patient_id")); }
  try { await request("/users", { method: "POST", body: JSON.stringify(body) }); notify("Account created. Share the CareFlow password privately."); loadPage(); }
  catch (error) { notify(error.message, true); }
}
if (token && user) render(); else renderLogin();
