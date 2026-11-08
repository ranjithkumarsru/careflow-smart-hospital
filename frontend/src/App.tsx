import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, ClipboardList,
  CreditCard, FlaskConical, KeyRound, LayoutDashboard, LogOut, Menu, Package, Plus, Search, ShieldCheck,
  Sparkles, Stethoscope, Users, X,
} from "lucide-react";
import { money } from "./format";

// Use the current site origin by default. This keeps API calls working through
// a share tunnel; deployments with a separate API can set VITE_API_URL.
const API = import.meta.env.VITE_API_URL || "";
type View = "overview" | "patients" | "appointments" | "clinical" | "assistant" | "laboratory" | "pharmacy" | "billing" | "staff";
type User = { id: number; email: string; full_name: string; role: string };
type StaffAccount = User & { active: boolean; created_at: string };
type Patient = { id: number; medical_record_number: string; full_name: string; date_of_birth: string; sex: string; phone: string; email: string; blood_group: string; allergies: string };
type Provider = { id: number; full_name: string; specialty: string; department: string };
type Appointment = { id: number; patient_id: number; provider_id: number; patient_name: string; provider_name: string; scheduled_at: string; reason: string; status: string; notes: string };
type Encounter = { id: number; patient_id: number; provider_id: number; chief_complaint: string; clinician_assessment: string; clinician_notes: string; plan: string; created_at: string };
type LabOrder = { id: number; patient_id: number; test_name: string; status: string; result: string; ordered_at: string };
type Medication = { id: number; name: string; strength: string; quantity_on_hand: number; reorder_level: number; unit_price: number };
type Prescription = { id: number; patient_id: number; medication_id: number; medication_name: string; patient_name: string; dosage: string; frequency: string; duration_days: number; status: string };
type InvoiceLine = { id: number; description: string; quantity: number; unit_price: number };
type Invoice = { id: number; patient_id: number; patient_name: string; status: string; currency: string; total: number; created_at: string; lines: InvoiceLine[] };
type Summary = { patients_total: number; appointments_today: number; pending_labs: number; low_stock_count: number; outstanding_balance: string; currency: string; recent_appointments: Appointment[]; department_activity: { department: string; appointments: number }[] };
type Notice = (message: string, kind?: "success" | "error") => void;

const nav: { id: View; label: string; icon: typeof LayoutDashboard; section: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, section: "Workspace" },
  { id: "patients", label: "Patients", icon: Users, section: "Workspace" },
  { id: "appointments", label: "Appointments", icon: CalendarDays, section: "Workspace" },
  { id: "clinical", label: "Clinical records", icon: Stethoscope, section: "Care delivery" },
  { id: "assistant", label: "AI Assistant Demo", icon: Sparkles, section: "Care delivery" },
  { id: "laboratory", label: "Laboratory", icon: FlaskConical, section: "Care delivery" },
  { id: "pharmacy", label: "Pharmacy", icon: Package, section: "Operations" },
  { id: "billing", label: "Billing", icon: CreditCard, section: "Operations" },
  { id: "staff", label: "Staff accounts", icon: ShieldCheck, section: "Administration" },
];

async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function useCollection<T>(path: string, token: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setItems(await api<T[]>(path, token)); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load records"); }
    finally { setLoading(false); }
  }, [path, token]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { items, loading, error, refresh };
}

function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
}
function timeLabel(value: string) { return dateLabel(value, { hour: "numeric", minute: "2-digit" }); }
function initials(name: string) { return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase(); }
function classStatus(value: string) { return `status status-${value.toLowerCase().replaceAll("_", "-")}`; }

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("careflow-token") || "");
  const [user, setUser] = useState<User | null>(() => {
    const saved = sessionStorage.getItem("careflow-user");
    return saved ? JSON.parse(saved) as User : null;
  });
  const [view, setView] = useState<View>("overview");
  const [notice, setNotice] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const flash: Notice = (text, kind = "success") => {
    setNotice({ text, kind });
    window.setTimeout(() => setNotice(null), 3500);
  };
  const onLogin = (nextToken: string, nextUser: User) => {
    sessionStorage.setItem("careflow-token", nextToken);
    sessionStorage.setItem("careflow-user", JSON.stringify(nextUser));
    setToken(nextToken); setUser(nextUser);
  };
  const logout = () => {
    sessionStorage.removeItem("careflow-token"); sessionStorage.removeItem("careflow-user");
    setToken(""); setUser(null);
  };
  if (!token || !user) return <Login onLogin={onLogin} />;
  const visibleNav = user.role === "admin" ? nav : nav.filter((item) => item.id !== "staff");
  const current = visibleNav.find((item) => item.id === view) || nav[0];
  const Page = view === "staff" && user.role === "admin" ? StaffPage : view === "overview" ? Dashboard : view === "patients" ? PatientsPage : view === "appointments" ? AppointmentsPage : view === "clinical" ? ClinicalPage : view === "assistant" ? AssistantDemoPage : view === "laboratory" ? LaboratoryPage : view === "pharmacy" ? PharmacyPage : view === "billing" ? BillingPage : Dashboard;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Activity size={21} /></div><div><strong>careflow</strong><span>HOSPITAL OS</span></div></div>
        <div className="workspace-pill"><span className="online-dot" /> City General Hospital <ChevronDown size={14} /></div>
        {(["Workspace", "Care delivery", "Operations", "Administration"] as const).map((section) => {
          const items = visibleNav.filter((item) => item.section === section);
          return items.length ? <div className="nav-group" key={section}><p className="nav-label">{section}</p>
            {items.map(({ id, label, icon: Icon }) => (
              <button className={`nav-item ${view === id ? "active" : ""}`} key={id} onClick={() => { setView(id); setSidebarOpen(false); }}>
                <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === "laboratory" && <span className="nav-count">2</span>}
              </button>
            ))}
          </div> : null;
        })}
        <div className="sidebar-bottom"><div className="sidebar-note"><ShieldCheck size={16} /><span>Secure workspace</span><span className="note-live">LIVE</span></div>
          <div className="profile-row"><div className="avatar avatar-blue">{initials(user.full_name)}</div><div className="profile-copy"><strong>{user.full_name}</strong><span>{user.role}</span></div>
            <button className="icon-button" title="Change password" aria-label="Change password" onClick={() => setPasswordOpen(true)}><KeyRound size={16}/></button>
            <button className="icon-button" title="Sign out" onClick={logout}><LogOut size={17} /></button></div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <main className="main-area">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>CareFlow</span><span className="crumb-slash">/</span><strong>{current.label}</strong></div>
          <div className="topbar-actions"><span className="today-label">{dateLabel(new Date().toISOString(), { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="avatar avatar-blue top-avatar">{initials(user.full_name)}</div></div>
        </header>
        <div className="content-area"><Page token={token} flash={flash} /></div>
      </main>
      {notice && <div className={`toast toast-${notice.kind}`} role="status">{notice.kind === "success" ? <Check size={17} /> : <X size={17} />}{notice.text}</div>}
      {passwordOpen && <ChangePassword token={token} close={() => setPasswordOpen(false)} flash={flash}/>}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const result = await api<{ access_token: string; user: User }>("/api/v1/auth/login", "", { method: "POST", body: JSON.stringify({ email, password }) }); onLogin(result.access_token, result.user); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign in"); }
    finally { setBusy(false); }
  }
  return <div className="login-screen"><div className="login-panel"><div className="brand login-brand"><div className="brand-mark"><Activity size={21} /></div><div><strong>careflow</strong><span>HOSPITAL OS</span></div></div>
    <div className="login-copy"><div className="eyebrow">HOSPITAL OPERATIONS PLATFORM</div><h1>Care teams, in sync.</h1><p>One clear view of patient care and hospital operations.</p></div>
    <form className="login-form" onSubmit={submit}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error && <p className="form-error">{error}</p>}<button className="primary-button login-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to CareFlow"}</button></form>
    <p className="login-demo">Use the CareFlow account provided by your hospital administrator.</p><div className="login-footer"><ShieldCheck size={15} /> Protected sign-in · Role-based access</div></div>
    <div className="login-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-card"><div className="art-card-head"><span className="pulse-dot" /> TODAY'S CARE SNAPSHOT</div><div className="art-pulse"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div><div className="art-numbers"><div><strong>128</strong><small>Patients today</small></div><div><strong>94.8%</strong><small>On-time care</small></div></div><div className="art-bottom"><span>Care delivery index</span><strong>+12.4% <ArrowUpRight size={14}/></strong></div></div><div className="art-caption">BETTER COORDINATION. MORE HUMAN CARE.</div></div></div>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
function SectionHeading({ title, action }: { title: string; action?: ReactNode }) { return <div className="section-heading"><h2>{title}</h2>{action}</div>; }
function Empty({ text }: { text: string }) { return <div className="empty-state">{text}</div>; }
function LoadingOrError({ loading, error }: { loading: boolean; error: string }) { return loading ? <div className="empty-state">Loading records…</div> : error ? <div className="empty-state error-text">{error}</div> : null; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function FormActions({ busy, onCancel, label = "Save record" }: { busy: boolean; onCancel: () => void; label?: string }) { return <div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : label}</button></div>; }

function StaffPage({ token, flash }: { token: string; flash: Notice }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const staff = useCollection<StaffAccount>("/api/v1/users", token);
  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    const payload = { full_name: data.get("full_name"), email: data.get("email"), role: data.get("role"), password: data.get("password") };
    try {
      await api<StaffAccount>("/api/v1/users", token, { method: "POST", body: JSON.stringify(payload) });
      setOpen(false); flash("Staff account created"); void staff.refresh();
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Could not create account", "error"); }
    finally { setBusy(false); }
  }
  async function setActive(account: StaffAccount) {
    try {
      await api<StaffAccount>(`/api/v1/users/${account.id}/active`, token, { method: "PATCH", body: JSON.stringify({ active: !account.active }) });
      flash(account.active ? "Staff account disabled" : "Staff account enabled"); void staff.refresh();
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Could not update account", "error"); }
  }
  return <><PageTitle eyebrow="ADMINISTRATION" title="Staff accounts" description="Give each team member their own CareFlow sign-in and role." action={<button className="primary-button" onClick={() => setOpen(true)}><Plus size={16}/> Add staff account</button>}/>
    <section className="panel table-panel"><div className="table-toolbar"><div><SectionHeading title="Hospital accounts"/><p className="table-caption">Passwords are stored as secure hashes. Give initial passwords privately.</p></div><span className="subtle-label">{staff.items.filter((item) => item.active).length} active</span></div><LoadingOrError loading={staff.loading} error={staff.error}/>{!staff.loading && <div className="table-scroll"><table><thead><tr><th>Staff member</th><th>Email sign-in</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{staff.items.map((account) => <tr key={account.id}><td><strong>{account.full_name}</strong></td><td>{account.email}</td><td><span className="status status-scheduled">{account.role}</span></td><td><span className={account.active ? "status status-completed" : "status status-cancelled"}>{account.active ? "Active" : "Disabled"}</span></td><td><button className="small-action" disabled={account.id === Number(JSON.parse(sessionStorage.getItem("careflow-user") || "{}").id) && account.active} onClick={() => void setActive(account)}>{account.active ? "Disable account" : "Enable account"}</button></td></tr>)}</tbody></table>{staff.items.length === 0 && <Empty text="No staff accounts yet."/>}</div>}</section>
    {open && <Modal title="Create staff account" close={() => setOpen(false)}><form className="form-grid" onSubmit={createAccount}>
      <Field label="Staff member name"><input name="full_name" required minLength={2} maxLength={160} autoComplete="name"/></Field>
      <Field label="Email used to sign in"><input name="email" type="email" required maxLength={255} autoComplete="email"/></Field>
      <Field label="Role"><select name="role" defaultValue="reception" required><option value="reception">Reception</option><option value="clinician">Clinician</option><option value="lab">Laboratory</option><option value="pharmacy">Pharmacy</option><option value="billing">Billing</option><option value="admin">Administrator</option></select></Field>
      <Field label="Temporary CareFlow password"><input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/><small>At least 12 characters, with a letter and a number. Ask them to change it after their first sign-in.</small></Field>
      <p className="form-span muted">This is a CareFlow password, not their email password. Share it privately; it is never sent by this app.</p>
      <div className="form-span"><FormActions busy={busy} onCancel={() => setOpen(false)} label="Create account"/></div>
    </form></Modal>}
  </>;
}

function ChangePassword({ token, close, flash }: { token: string; close: () => void; flash: Notice }) {
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("current_password") || "");
    const newPassword = String(data.get("new_password") || "");
    if (newPassword !== data.get("confirm_password")) { flash("New passwords do not match", "error"); setBusy(false); return; }
    try {
      await api("/api/v1/auth/password", token, { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
      close(); flash("Password changed");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Could not change password", "error"); }
    finally { setBusy(false); }
  }
  return <Modal title="Change your password" close={close}><form className="form-grid" onSubmit={save}>
    <Field label="Current CareFlow password"><input name="current_password" type="password" autoComplete="current-password" required/></Field>
    <Field label="New password"><input name="new_password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/><small>Use at least 12 characters, including a letter and a number.</small></Field>
    <Field label="Confirm new password"><input name="confirm_password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></Field>
    <div className="form-span"><FormActions busy={busy} onCancel={close} label="Update password"/></div>
  </form></Modal>;
}

function Dashboard({ token, flash }: { token: string; flash: Notice }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => api<Summary>("/api/v1/analytics/summary", token).then(setSummary).catch((cause) => setError(cause.message)), [token]);
  useEffect(() => { void reload(); }, [reload]);
  const maximum = Math.max(1, ...(summary?.department_activity.map((item) => item.appointments) || [1]));
  return <><PageTitle eyebrow="TUESDAY · HOSPITAL OVERVIEW" title="Good morning, care team" description="A live view of your hospital's care and operations." action={<button className="secondary-button" onClick={() => { void reload(); flash("Dashboard refreshed"); }}><Activity size={16}/> Refresh data</button>} />
    <LoadingOrError loading={!summary && !error} error={error}/>
    {summary && <><div className="metrics-grid">
      <MetricCard icon={Users} label="Registered patients" value={summary.patients_total.toLocaleString()} change="Across all departments" tone="blue"/>
      <MetricCard icon={CalendarDays} label="Appointments today" value={String(summary.appointments_today).padStart(2,"0")} change="Scheduled for today" tone="mint"/>
      <MetricCard icon={FlaskConical} label="Lab work in progress" value={String(summary.pending_labs).padStart(2,"0")} change="Pending or processing" tone="amber"/>
      <MetricCard icon={CreditCard} label="Outstanding balance" value={money(summary.outstanding_balance, summary.currency)} change="Open invoices" tone="violet"/>
    </div><div className="dashboard-grid">
      <section className="panel appointments-panel"><SectionHeading title="Today's schedule" action={<button className="text-button" onClick={() => flash("Open Appointments in the sidebar to manage the schedule")}>View schedule <ArrowUpRight size={14}/></button>}/>
        <div className="schedule-list">{summary.recent_appointments.slice(0, 5).length ? summary.recent_appointments.slice(0, 5).map((item) => <div className="schedule-row" key={item.id}><div className="schedule-time">{timeLabel(item.scheduled_at)}</div><div className="avatar avatar-small">{initials(item.patient_name)}</div><div className="schedule-person"><strong>{item.patient_name}</strong><span>{item.reason}</span></div><div className="schedule-provider">{item.provider_name}</div><span className={classStatus(item.status)}>{item.status.replaceAll("_", " ")}</span></div>) : <Empty text="No appointments have been scheduled yet."/>}</div>
      </section>
      <section className="panel department-panel"><SectionHeading title="Department activity" action={<span className="subtle-label">Appointments</span>}/><div className="department-list">{summary.department_activity.length ? summary.department_activity.map((item, index) => <div className="department-row" key={item.department}><div className="department-name"><span className={`department-dot dot-${index % 4}`}/><span>{item.department}</span><strong>{item.appointments}</strong></div><div className="bar-track"><span className={`bar-fill bar-${index % 4}`} style={{ width: `${Math.max(9, item.appointments / maximum * 100)}%` }}/></div></div>) : <Empty text="Department activity appears after appointments are added."/>}</div>
        <div className="panel-footer"><span><span className="online-dot"/> Live operational data</span><span>{summary.low_stock_count} low-stock items</span></div>
      </section></div>
      <div className="workflow-strip"><div><div className="workflow-icon"><ClipboardList size={18}/></div><div><strong>Care workflow</strong><span>Appointments → encounters → labs → billing</span></div></div><div className="workflow-step"><span className="step-number">01</span> Register</div><div className="workflow-arrow">→</div><div className="workflow-step"><span className="step-number">02</span> Coordinate care</div><div className="workflow-arrow">→</div><div className="workflow-step"><span className="step-number">03</span> Close the loop</div></div>
    </>}
  </>;
}
function MetricCard({ icon: Icon, label, value, change, tone }: { icon: typeof Users; label: string; value: string; change: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon metric-${tone}`}><Icon size={19}/></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-change"><span className="change-neutral"><ArrowDownRight size={13}/></span>{change}</div></div>;
}

function PatientsPage({ token, flash }: { token: string; flash: Notice }) {
  const [query, setQuery] = useState(""); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const path = `/api/v1/patients?q=${encodeURIComponent(query)}`;
  const { items, loading, error, refresh } = useCollection<Patient>(path, token);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries());
    try { await api<Patient>("/api/v1/patients", token, { method: "POST", body: JSON.stringify(payload) }); setOpen(false); flash("Patient registered"); void refresh(); }
    catch (cause) { flash(cause instanceof Error ? cause.message : "Could not save patient", "error"); }
    finally { setBusy(false); }
  }
  return <><PageTitle eyebrow="PATIENT SERVICES" title="Patients" description="A secure directory of registered patients and their records." action={<button className="primary-button" onClick={() => setOpen(true)}><Plus size={16}/> Register patient</button>}/>
    <section className="panel table-panel"><div className="table-toolbar"><div><SectionHeading title="Patient directory"/><p className="table-caption">{items.length} patient records</p></div><div className="search-box"><Search size={16}/><input aria-label="Search patients" placeholder="Search name, record ID, or phone" value={query} onChange={(event) => setQuery(event.target.value)}/></div></div>
      <LoadingOrError loading={loading} error={error}/>{!loading && !error && <div className="table-scroll"><table><thead><tr><th>Patient</th><th>Record ID</th><th>Date of birth</th><th>Blood group</th><th>Contact</th><th>Allergies</th></tr></thead><tbody>{items.map((patient) => <tr key={patient.id}><td><div className="person-cell"><div className="avatar">{initials(patient.full_name)}</div><div><strong>{patient.full_name}</strong><span>{patient.sex}</span></div></div></td><td><span className="record-id">{patient.medical_record_number}</span></td><td>{dateLabel(patient.date_of_birth, { year: "numeric", month: "short", day: "numeric" })}</td><td><span className="blood-chip">{patient.blood_group}</span></td><td>{patient.phone || patient.email || "—"}</td><td className="truncate-cell">{patient.allergies || "None recorded"}</td></tr>)}</tbody></table>{items.length === 0 && <Empty text="No patient records match this search."/>}</div>}</section>
    {open && <Modal title="Register a patient" close={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="Full name"><input name="full_name" required minLength={2}/></Field><Field label="Date of birth"><input type="date" name="date_of_birth" required/></Field><Field label="Sex"><select name="sex"><option>Not specified</option><option>Female</option><option>Male</option><option>Other</option></select></Field><Field label="Phone"><input name="phone"/></Field><Field label="Email"><input type="email" name="email"/></Field><Field label="Blood group"><select name="blood_group"><option>Unknown</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((v)=><option key={v}>{v}</option>)}</select></Field><Field label="Address"><input name="address"/></Field><Field label="Allergies"><input name="allergies" defaultValue="None recorded"/></Field><div className="form-span"><FormActions busy={busy} onCancel={() => setOpen(false)}/></div></form></Modal>}
  </>;
}

function AppointmentsPage({ token, flash }: { token: string; flash: Notice }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const appointments = useCollection<Appointment>("/api/v1/appointments", token);
  const patients = useCollection<Patient>("/api/v1/patients", token);
  const providers = useCollection<Provider>("/api/v1/providers", token);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); const scheduled = String(data.get("scheduled_at"));
    const payload = { patient_id: Number(data.get("patient_id")), provider_id: Number(data.get("provider_id")), scheduled_at: new Date(scheduled).toISOString(), reason: data.get("reason") };
    try { await api("/api/v1/appointments", token, { method: "POST", body: JSON.stringify(payload) }); setOpen(false); flash("Appointment scheduled"); void appointments.refresh(); }
    catch (cause) { flash(cause instanceof Error ? cause.message : "Could not schedule appointment", "error"); } finally { setBusy(false); }
  }
  async function update(item: Appointment, status: string) {
    try { await api(`/api/v1/appointments/${item.id}`, token, { method: "PATCH", body: JSON.stringify({ status, notes: item.notes }) }); flash(`Appointment marked ${status.replaceAll("_", " ")}`); void appointments.refresh(); }
    catch (cause) { flash(cause instanceof Error ? cause.message : "Could not update appointment", "error"); }
  }
  const sorted = useMemo(() => [...appointments.items].sort((a,b) => a.scheduled_at.localeCompare(b.scheduled_at)), [appointments.items]);
  return <><PageTitle eyebrow="SCHEDULING" title="Appointments" description="Coordinate the day across patients, providers, and departments." action={<button className="primary-button" onClick={() => setOpen(true)}><Plus size={16}/> New appointment</button>}/>
    <section className="panel table-panel"><div className="table-toolbar"><div><SectionHeading title="Appointment schedule"/><p className="table-caption">{appointments.items.length} scheduled visits</p></div><div className="subtle-label"><CalendarDays size={15}/> All dates</div></div><LoadingOrError loading={appointments.loading || patients.loading || providers.loading} error={appointments.error || patients.error || providers.error}/>
      {!appointments.loading && !appointments.error && <div className="table-scroll"><table><thead><tr><th>Date & time</th><th>Patient</th><th>Provider</th><th>Reason</th><th>Status</th><th>Next action</th></tr></thead><tbody>{sorted.map((item) => <tr key={item.id}><td><strong>{dateLabel(item.scheduled_at, { month: "short", day: "numeric" })}</strong><span className="cell-subline">{timeLabel(item.scheduled_at)}</span></td><td>{item.patient_name}</td><td>{item.provider_name}</td><td>{item.reason}</td><td><span className={classStatus(item.status)}>{item.status.replaceAll("_", " ")}</span></td><td>{["scheduled", "confirmed"].includes(item.status) ? <button className="small-action" onClick={() => void update(item, "checked_in")}>Check in</button> : item.status === "checked_in" ? <button className="small-action" onClick={() => void update(item, "completed")}>Complete</button> : <span className="muted">—</span>}</td></tr>)}</tbody></table>{sorted.length === 0 && <Empty text="No appointments yet. Schedule the first visit."/>}</div>}</section>
    {open && <Modal title="Schedule an appointment" close={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="Patient"><select name="patient_id" required defaultValue=""><option value="" disabled>Select patient</option>{patients.items.map((p)=><option key={p.id} value={p.id}>{p.full_name} · {p.medical_record_number}</option>)}</select></Field><Field label="Provider"><select name="provider_id" required defaultValue=""><option value="" disabled>Select provider</option>{providers.items.map((p)=><option key={p.id} value={p.id}>{p.full_name} · {p.department}</option>)}</select></Field><Field label="Date and time"><input type="datetime-local" name="scheduled_at" required/></Field><Field label="Visit reason"><input name="reason" required minLength={2}/></Field><div className="form-span"><FormActions busy={busy} onCancel={() => setOpen(false)}/></div></form></Modal>}
  </>;
}

function AssistantDemoPage(_props: { token: string; flash: Notice }) {
  const [messages, setMessages] = useState<Array<{ role: "assistant" | "you"; text: string }>>([
    { role: "assistant", text: "Hello. This preview uses CareFlow’s fictional training chart. Choose a sample task to see how a staff-facing assistant might write a concise, chart-based draft." },
  ]);
  const scenarios = [
    {
      prompt: "Summarize a sample chart",
      reply: "Sample chart summary — Aarav Sharma (CF-100241)\nVisit: Routine follow-up with Dr. Maya Iyer.\nRecorded observations: blood pressure 122/78 mmHg, pulse 74 bpm, temperature 36.8 °C, and oxygen saturation 98%.\nAllergies: No known allergies recorded. CBC: processing.\nThe note asks the clinician to review reported symptoms and the medication list. The assessment and plan contain demo placeholder text, so check the chart before using this summary.",
    },
    {
      prompt: "Draft a sample handoff",
      reply: "Handoff draft — Aarav Sharma (CF-100241)\nRoutine follow-up with Dr. Maya Iyer. The training chart records BP 122/78 mmHg, pulse 74 bpm, temperature 36.8 °C, and oxygen saturation 98%. No known allergies are recorded. A CBC is still marked as processing.\nPlease verify the latest lab status and review the current medication list in the chart. This draft is based on fictional training data and needs staff review.",
    },
    {
      prompt: "What can this assistant help with?",
      reply: "In a real, approved workflow, an assistant could help staff summarize chart entries, prepare a handoff draft, or point out information that still needs checking. A clinician would review every draft. This preview uses fixed sample replies: it does not read live patient records, diagnose, recommend treatment, or contact an AI service.",
    },
  ];

  function runScenario(scenario: (typeof scenarios)[number]) {
    setMessages((current) => [...current, { role: "you", text: scenario.prompt }, { role: "assistant", text: scenario.reply }]);
  }

  function resetDemo() {
    setMessages([{ role: "assistant", text: "Hello. This preview uses CareFlow’s fictional training chart. Choose a sample task to see how a staff-facing assistant might write a concise, chart-based draft." }]);
  }

  return <>
    <PageTitle eyebrow="ASSISTED WORKFLOW · DEMO" title="AI Assistant" description="See realistic sample drafts based on CareFlow’s fictional training chart." />
    <div className="ai-demo-layout">
      <section className="panel ai-demo-panel">
        <div className="ai-demo-heading">
          <div className="prep-icon"><Sparkles size={17}/></div>
          <div><div className="eyebrow">FICTIONAL TRAINING CHART</div><h2>CareFlow assistant preview</h2></div>
          <span className="ai-demo-badge">DEMO</span>
        </div>
        <p className="ai-demo-intro">Choose a task to see a polished draft using the fictional training chart already shown in CareFlow.</p>
        <div className="ai-demo-disclosure"><ShieldCheck size={16}/><span>These replies are fixed examples, not generated by AI. They use fictional training details only; no live patient records are read or sent. Staff must verify every detail.</span></div>
        <div className="ai-demo-prompts" aria-label="Sample assistant prompts">
          {scenarios.map((scenario) => <button key={scenario.prompt} className="secondary-button" onClick={() => runScenario(scenario)}><Sparkles size={14}/>{scenario.prompt}</button>)}
        </div>
        <div className="ai-demo-chat" role="log" aria-live="polite" aria-label="Demo conversation">
          {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`ai-message ai-message-${message.role}`}>
            <span>{message.role === "assistant" ? "CareFlow assistant · demo" : "Sample prompt"}</span>
            <p>{message.text}</p>
          </div>)}
        </div>
        <div className="ai-demo-footer"><span>For education and presentation only · clinician review is required</span><button className="text-button" onClick={resetDemo}>Reset demo</button></div>
      </section>
      <aside className="panel ai-demo-side">
        <div className="eyebrow">HOW TO PRESENT</div>
        <h2>Show a sample workflow</h2>
        <ol>
          <li>Choose a sample task.</li>
          <li>Compare the draft with the fictional chart details.</li>
          <li>Explain that this version uses prepared examples, not live AI.</li>
        </ol>
        <div className="ethics-note"><ShieldCheck size={16}/><span>Never enter real patient information into this demo.</span></div>
      </aside>
    </div>
  </>;
}

function ClinicalPage({ token, flash }: { token: string; flash: Notice }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const encounters = useCollection<Encounter>("/api/v1/encounters", token); const patients = useCollection<Patient>("/api/v1/patients", token); const providers = useCollection<Provider>("/api/v1/providers", token);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget);
    const payload = { patient_id: Number(data.get("patient_id")), provider_id: Number(data.get("provider_id")), chief_complaint: data.get("chief_complaint"), clinician_notes: data.get("clinician_notes"), clinician_assessment: data.get("clinician_assessment"), plan: data.get("plan"), vitals: { blood_pressure: data.get("blood_pressure"), heart_rate: Number(data.get("heart_rate") || 0), temperature_c: Number(data.get("temperature_c") || 0), oxygen_saturation: Number(data.get("oxygen_saturation") || 0) } };
    try { await api("/api/v1/encounters", token, { method: "POST", body: JSON.stringify(payload) }); setOpen(false); flash("Clinical encounter saved"); void encounters.refresh(); }
    catch (cause) { flash(cause instanceof Error ? cause.message : "Could not save encounter", "error"); } finally { setBusy(false); }
  }
  async function createSummary(patientId: number) {
    try { setSummary(await api(`/api/v1/patients/${patientId}/care-summary`, token)); }
    catch (cause) { flash(cause instanceof Error ? cause.message : "Could not prepare chart context", "error"); }
  }
  return <><PageTitle eyebrow="CARE DELIVERY" title="Clinical records" description="Document clinician-authored notes and review a patient's recorded care context." action={<button className="primary-button" onClick={() => setOpen(true)}><Plus size={16}/> New encounter</button>}/>
    <div className="clinical-layout"><section className="panel table-panel"><div className="table-toolbar"><div><SectionHeading title="Recent encounters"/><p className="table-caption">Clinical notes remain clinician-authored.</p></div></div><LoadingOrError loading={encounters.loading || patients.loading || providers.loading} error={encounters.error || patients.error || providers.error}/>{!encounters.loading && <div className="encounter-list">{encounters.items.map((item)=><article className="encounter-card" key={item.id}><div className="encounter-date"><span>{dateLabel(item.created_at, { month:"short", day:"numeric" })}</span><small>{timeLabel(item.created_at)}</small></div><div className="encounter-main"><div className="encounter-title"><strong>{patients.items.find((p)=>p.id===item.patient_id)?.full_name || `Patient #${item.patient_id}`}</strong><span className="record-id">ENC-{String(item.id).padStart(5,"0")}</span></div><p>{item.chief_complaint}</p><div className="encounter-meta">{providers.items.find((p)=>p.id===item.provider_id)?.full_name || "Provider"} · {item.clinician_assessment || "Assessment not entered"}</div></div><button className="text-button" onClick={() => void createSummary(item.patient_id)}>Prepare chart context</button></article>)}{encounters.items.length === 0 && <Empty text="No encounters yet. Record a clinician consultation to begin the EHR."/>}</div>}</section>
      <aside className="panel prep-panel"><div className="prep-icon"><Activity size={17}/></div><div className="eyebrow">CLINICIAN REVIEW</div><h2>Visit preparation</h2><p>Assemble a concise view of recorded allergies, the latest encounter, active prescriptions, and pending labs.</p><select aria-label="Choose patient for chart context" id="summary-patient" defaultValue=""><option value="" disabled>Choose a patient</option>{patients.items.map((p)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select><button className="secondary-button full-button" onClick={() => { const id = Number((document.getElementById("summary-patient") as HTMLSelectElement).value); if (id) void createSummary(id); else flash("Choose a patient first", "error"); }}>Prepare context <ArrowUpRight size={15}/></button>
        {summary && <div className="summary-output"><strong>{String(summary.patient_name)}</strong><p>Allergies: {String(summary.allergies)}</p><p>{String((summary.recent_encounter as { chief_complaint?: string } | null)?.chief_complaint || "No prior encounter recorded")}</p><small>{String(summary.notice)}</small></div>}
        <div className="ethics-note"><ShieldCheck size={16}/><span>Draft context only. No diagnosis or treatment advice is generated. Clinician review is required.</span></div></aside></div>
    {open && <Modal title="Document clinical encounter" close={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="Patient"><select name="patient_id" required defaultValue=""><option value="" disabled>Select patient</option>{patients.items.map((p)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field><Field label="Provider"><select name="provider_id" required defaultValue=""><option value="" disabled>Select provider</option>{providers.items.map((p)=><option key={p.id} value={p.id}>{p.full_name} · {p.specialty}</option>)}</select></Field><Field label="Chief complaint"><input name="chief_complaint" required/></Field><Field label="Blood pressure"><input name="blood_pressure" placeholder="e.g. 120/80"/></Field><Field label="Heart rate (bpm)"><input type="number" name="heart_rate" min="0"/></Field><Field label="Temperature (°C)"><input type="number" name="temperature_c" step="0.1" min="0"/></Field><Field label="Oxygen saturation (%)"><input type="number" name="oxygen_saturation" min="0" max="100"/></Field><Field label="Clinician assessment"><textarea name="clinician_assessment" rows={2}/></Field><Field label="Clinical notes"><textarea name="clinician_notes" rows={3}/></Field><Field label="Plan"><textarea name="plan" rows={2}/></Field><div className="form-span"><FormActions busy={busy} onCancel={() => setOpen(false)}/></div></form></Modal>}
  </>;
}

function LaboratoryPage({ token, flash }: { token: string; flash: Notice }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const labs = useCollection<LabOrder>("/api/v1/labs", token); const patients = useCollection<Patient>("/api/v1/patients", token);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); const payload = { patient_id: Number(data.get("patient_id")), test_name: data.get("test_name") }; try { await api("/api/v1/labs", token, { method:"POST", body:JSON.stringify(payload) }); setOpen(false); flash("Lab order created"); void labs.refresh(); } catch(cause) { flash(cause instanceof Error ? cause.message : "Could not save lab order", "error"); } finally { setBusy(false); } }
  async function advance(item: LabOrder) { const status = item.status === "pending" ? "processing" : "completed"; try { await api(`/api/v1/labs/${item.id}`, token, { method:"PATCH", body:JSON.stringify({ status, result: status === "completed" ? "Result recorded by laboratory staff; clinician review pending." : item.result }) }); flash(`Lab order moved to ${status}`); void labs.refresh(); } catch(cause) { flash(cause instanceof Error ? cause.message : "Could not update lab", "error"); } }
  return <><PageTitle eyebrow="DIAGNOSTICS" title="Laboratory" description="Track orders from collection through result entry and clinician review." action={<button className="primary-button" onClick={() => setOpen(true)}><Plus size={16}/> New lab order</button>}/>
    <div className="metrics-grid compact-metrics"><MetricCard icon={FlaskConical} label="Open orders" value={String(labs.items.filter((i)=>["pending","processing"].includes(i.status)).length).padStart(2,"0")} change="Pending or processing" tone="amber"/><MetricCard icon={Check} label="Completed" value={String(labs.items.filter((i)=>i.status === "completed").length).padStart(2,"0")} change="Result recorded" tone="mint"/><MetricCard icon={Users} label="Patients with orders" value={String(new Set(labs.items.map((i)=>i.patient_id)).size).padStart(2,"0")} change="Unique patients" tone="blue"/></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><SectionHeading title="Lab worklist"/><p className="table-caption">Order status and result handoff</p></div><span className="subtle-label"><span className="online-dot"/> Connected</span></div><LoadingOrError loading={labs.loading || patients.loading} error={labs.error || patients.error}/>{!labs.loading && <div className="table-scroll"><table><thead><tr><th>Order</th><th>Patient</th><th>Ordered</th><th>Status</th><th>Result</th><th>Action</th></tr></thead><tbody>{labs.items.map((item)=><tr key={item.id}><td><strong>{item.test_name}</strong><span className="cell-subline">LAB-{String(item.id).padStart(5,"0")}</span></td><td>{patients.items.find((p)=>p.id===item.patient_id)?.full_name || `Patient #${item.patient_id}`}</td><td>{dateLabel(item.ordered_at, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}</td><td><span className={classStatus(item.status)}>{item.status}</span></td><td className="truncate-cell">{item.result || "Awaiting result"}</td><td>{item.status === "completed" ? <span className="muted">Complete</span> : <button className="small-action" onClick={() => void advance(item)}>{item.status === "pending" ? "Start processing" : "Record result"}</button>}</td></tr>)}</tbody></table>{labs.items.length === 0 && <Empty text="No lab orders yet."/>}</div>}</section>
    {open && <Modal title="Create lab order" close={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="Patient"><select name="patient_id" required defaultValue=""><option value="" disabled>Select patient</option>{patients.items.map((p)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field><Field label="Test name"><input name="test_name" required placeholder="e.g. Complete blood count"/></Field><div className="form-span"><FormActions busy={busy} onCancel={() => setOpen(false)}/></div></form></Modal>}
  </>;
}

function PharmacyPage({ token, flash }: { token: string; flash: Notice }) {
  const [open, setOpen] = useState(false); const [prescriptionOpen, setPrescriptionOpen] = useState(false); const [busy, setBusy] = useState(false);
  const medications = useCollection<Medication>("/api/v1/medications", token); const prescriptions = useCollection<Prescription>("/api/v1/prescriptions", token); const patients = useCollection<Patient>("/api/v1/patients", token); const encounters = useCollection<Encounter>("/api/v1/encounters", token);
  async function addMedication(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); const payload = { name:data.get("name"), strength:data.get("strength"), quantity_on_hand:Number(data.get("quantity_on_hand")), reorder_level:Number(data.get("reorder_level")), unit_price:Number(data.get("unit_price")) }; try { await api("/api/v1/medications", token, { method:"POST", body:JSON.stringify(payload) }); setOpen(false); flash("Medication added to inventory"); void medications.refresh(); } catch(cause) { flash(cause instanceof Error ? cause.message : "Could not add medication", "error"); } finally { setBusy(false); } }
  async function adjust(item: Medication, amount: number) { try { await api(`/api/v1/medications/${item.id}/stock`, token, { method:"PATCH", body:JSON.stringify({ quantity_on_hand:Math.max(0,item.quantity_on_hand+amount) }) }); void medications.refresh(); } catch(cause) { flash(cause instanceof Error ? cause.message : "Could not update stock", "error"); } }
  async function prescribe(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget); const payload = { patient_id:Number(data.get("patient_id")), encounter_id:Number(data.get("encounter_id")), medication_id:Number(data.get("medication_id")), dosage:data.get("dosage"), frequency:data.get("frequency"), duration_days:Number(data.get("duration_days")) }; try { await api("/api/v1/prescriptions", token, { method:"POST", body:JSON.stringify(payload) }); setPrescriptionOpen(false); flash("Prescription recorded"); void prescriptions.refresh(); } catch(cause) { flash(cause instanceof Error ? cause.message : "Could not save prescription", "error"); } finally { setBusy(false); } }
  async function dispense(item: Prescription) { try { await api(`/api/v1/prescriptions/${item.id}/dispense`, token, { method:"PATCH", body:JSON.stringify({ status:"dispensed" }) }); flash("Prescription dispensed; stock updated"); void prescriptions.refresh(); void medications.refresh(); } catch(cause) { flash(cause instanceof Error ? cause.message : "Could not dispense prescription", "error"); } }
  return <><PageTitle eyebrow="PHARMACY OPERATIONS" title="Pharmacy" description="Monitor stock levels and coordinate clinician-authorized prescriptions." action={<><button className="secondary-button" onClick={() => setOpen(true)}><Plus size={16}/> Add medication</button><button className="primary-button" onClick={() => setPrescriptionOpen(true)}><Plus size={16}/> New prescription</button></>}/>
    <section className="panel table-panel"><div className="table-toolbar"><div><SectionHeading title="Medication inventory"/><p className="table-caption">{medications.items.length} active products · quantities on hand</p></div><span className="subtle-label">{medications.items.filter((m)=>m.quantity_on_hand<=m.reorder_level).length} reorder alerts</span></div><LoadingOrError loading={medications.loading} error={medications.error}/>{!medications.loading && <div className="table-scroll"><table><thead><tr><th>Medication</th><th>Stock level</th><th>Reorder at</th><th>Unit price</th><th>Adjust stock</th></tr></thead><tbody>{medications.items.map((item)=><tr key={item.id}><td><div className="med-cell"><div className="med-icon"><Package size={16}/></div><div><strong>{item.name}</strong><span>{item.strength}</span></div></div></td><td><span className={item.quantity_on_hand<=item.reorder_level ? "stock-low" : "stock-good"}>{item.quantity_on_hand} units</span></td><td>{item.reorder_level} units</td><td>{money(item.unit_price)}</td><td><div className="stock-adjust"><button aria-label={`Remove one ${item.name}`} onClick={() => void adjust(item,-1)}>−</button><span>{item.quantity_on_hand}</span><button aria-label={`Add one ${item.name}`} onClick={() => void adjust(item,1)}>+</button></div></td></tr>)}</tbody></table>{medications.items.length===0 && <Empty text="No medication inventory has been added."/>}</div>}</section>
    <section className="panel table-panel margin-top"><div className="table-toolbar"><div><SectionHeading title="Prescription queue"/><p className="table-caption">Active orders awaiting dispensing</p></div></div><LoadingOrError loading={prescriptions.loading} error={prescriptions.error}/>{!prescriptions.loading && <div className="table-scroll"><table><thead><tr><th>Patient</th><th>Medication</th><th>Dosage</th><th>Duration</th><th>Status</th><th>Action</th></tr></thead><tbody>{prescriptions.items.map((item)=><tr key={item.id}><td>{item.patient_name}</td><td>{item.medication_name}</td><td>{item.dosage} · {item.frequency}</td><td>{item.duration_days} days</td><td><span className={classStatus(item.status)}>{item.status}</span></td><td>{item.status==="active" ? <button className="small-action" onClick={() => void dispense(item)}>Dispense</button> : <span className="muted">—</span>}</td></tr>)}</tbody></table>{prescriptions.items.length===0 && <Empty text="No prescriptions in the queue."/>}</div>}</section>
    {open && <Modal title="Add medication" close={() => setOpen(false)}><form className="form-grid" onSubmit={addMedication}><Field label="Medication name"><input name="name" required/></Field><Field label="Strength"><input name="strength" placeholder="e.g. 500 mg"/></Field><Field label="Quantity on hand"><input name="quantity_on_hand" type="number" min="0" required/></Field><Field label="Reorder level"><input name="reorder_level" type="number" min="0" defaultValue="10" required/></Field><Field label="Unit price"><input name="unit_price" type="number" min="0" step="0.01" defaultValue="0" required/></Field><div className="form-span"><FormActions busy={busy} onCancel={() => setOpen(false)}/></div></form></Modal>}
    {prescriptionOpen && <Modal title="Record prescription" close={() => setPrescriptionOpen(false)}><form className="form-grid" onSubmit={prescribe}><Field label="Patient"><select name="patient_id" required defaultValue=""><option value="" disabled>Select patient</option>{patients.items.map((p)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field><Field label="Encounter"><select name="encounter_id" required defaultValue=""><option value="" disabled>Select encounter</option>{encounters.items.map((e)=><option key={e.id} value={e.id}>ENC-{e.id} · {e.chief_complaint}</option>)}</select></Field><Field label="Medication"><select name="medication_id" required defaultValue=""><option value="" disabled>Select medication</option>{medications.items.map((m)=><option key={m.id} value={m.id}>{m.name} {m.strength}</option>)}</select></Field><Field label="Dosage"><input name="dosage" required placeholder="e.g. 1 tablet"/></Field><Field label="Frequency"><input name="frequency" required placeholder="e.g. as directed by clinician"/></Field><Field label="Duration (days)"><input name="duration_days" type="number" min="1" max="365" required/></Field><div className="form-span"><FormActions busy={busy} onCancel={() => setPrescriptionOpen(false)}/></div></form></Modal>}
  </>;
}

function BillingPage({ token, flash }: { token: string; flash: Notice }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const invoices = useCollection<Invoice>("/api/v1/invoices", token); const patients = useCollection<Patient>("/api/v1/patients", token);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const data=new FormData(event.currentTarget); const payload={ patient_id:Number(data.get("patient_id")), lines:[{ description:data.get("description"), quantity:Number(data.get("quantity")), unit_price:Number(data.get("unit_price")) }] }; try { await api("/api/v1/invoices",token,{method:"POST",body:JSON.stringify(payload)}); setOpen(false); flash("Invoice created"); void invoices.refresh(); } catch(cause) { flash(cause instanceof Error ? cause.message : "Could not create invoice","error"); } finally { setBusy(false); } }
  async function markPaid(invoice: Invoice) { try { await api(`/api/v1/invoices/${invoice.id}/pay`,token,{method:"PATCH"}); flash("Invoice marked paid"); void invoices.refresh(); } catch(cause) { flash(cause instanceof Error ? cause.message : "Could not update invoice","error"); } }
  const openTotal=invoices.items.filter((item)=>item.status==="open").reduce((total,item)=>total+Number(item.total),0);
  return <><PageTitle eyebrow="REVENUE CYCLE" title="Billing" description="Create transparent invoices and track balances by patient." action={<button className="primary-button" onClick={() => setOpen(true)}><Plus size={16}/> Create invoice</button>}/>
    <div className="metrics-grid compact-metrics"><MetricCard icon={CreditCard} label="Open invoices" value={String(invoices.items.filter((i)=>i.status==="open").length).padStart(2,"0")} change="Awaiting payment" tone="violet"/><MetricCard icon={Activity} label="Open balance" value={money(openTotal)} change="Current open invoices" tone="amber"/><MetricCard icon={Check} label="Paid invoices" value={String(invoices.items.filter((i)=>i.status==="paid").length).padStart(2,"0")} change="Payment recorded" tone="mint"/></div>
    <section className="panel table-panel"><div className="table-toolbar"><div><SectionHeading title="Invoices"/><p className="table-caption">Billing records and line-item totals</p></div><span className="subtle-label">{invoices.items.length} total</span></div><LoadingOrError loading={invoices.loading || patients.loading} error={invoices.error || patients.error}/>{!invoices.loading && <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Patient</th><th>Date</th><th>Line items</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{invoices.items.map((item)=><tr key={item.id}><td><span className="record-id">INV-{String(item.id).padStart(5,"0")}</span></td><td>{item.patient_name || patients.items.find((p)=>p.id===item.patient_id)?.full_name}</td><td>{dateLabel(item.created_at,{month:"short",day:"numeric",year:"numeric"})}</td><td>{item.lines.map((line)=>line.description).join(", ")}</td><td><strong>{money(item.total,item.currency)}</strong></td><td><span className={classStatus(item.status)}>{item.status}</span></td><td>{item.status==="open" ? <button className="small-action" onClick={() => void markPaid(item)}>Mark paid</button> : <span className="muted">{item.status}</span>}</td></tr>)}</tbody></table>{invoices.items.length===0 && <Empty text="No invoices yet."/>}</div>}</section>
    {open && <Modal title="Create invoice" close={() => setOpen(false)}><form className="form-grid" onSubmit={save}><Field label="Patient"><select name="patient_id" required defaultValue=""><option value="" disabled>Select patient</option>{patients.items.map((p)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field><Field label="Line item description"><input name="description" required placeholder="Consultation, diagnostic test…"/></Field><Field label="Quantity"><input name="quantity" type="number" min="1" defaultValue="1" required/></Field><Field label="Unit price"><input name="unit_price" type="number" min="0" step="0.01" required/></Field><div className="form-span"><FormActions busy={busy} onCancel={() => setOpen(false)}/></div></form></Modal>}
  </>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><div className="eyebrow">CARE FLOW</div><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={18}/></button></div>{children}</section></div>;
}
