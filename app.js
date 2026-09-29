/* SmartCampus Web Conversion
   Converted from the supplied Java Swing + SQLite project.
   Production mode: static browser UI + Supabase Edge Function + Postgres.
   Demo mode: localStorage only, so the website can be opened immediately.
*/

const CONFIG = window.SMARTCAMPUS_CONFIG || {};
const REAL_MODE = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_PUBLISHABLE_KEY && window.supabase);
const sb = REAL_MODE ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY) : null;
const sessionKey = "smartcampus.session.v4";
const DEMO_DB_KEY = "smartcampus.demo.db.v4";

const state = {
  view: "login",
  loginMode: "organization",
  customers: [],
  organizations: [],
  user: null,
  customer: null,
  organization: null,
  selectedSuperCustomerId: null,
  pendingSuperLogin: null,
  data: null
};

const DEMO = {
  customers: [{ id: 1, code: "CUST1", name: "Demo Customer", status: "ACTIVE" }],
  organizations: [{ id: 1, customer_id: 1, code: "ABC001", name: "ABC College", status: "ACTIVE", created_at: "2026-01-01 10:00:00" }],
  users: [
    { id: 1, customer_id: 1, organization_id: 1, username: "student1", password: "1234", full_name: "Kishore", role: "STUDENT", status: "ACTIVE", must_change_password: true },
    { id: 2, customer_id: 1, organization_id: 1, username: "student2", password: "1234", full_name: "Rahul", role: "STUDENT", status: "ACTIVE", must_change_password: true },
    { id: 3, customer_id: 1, organization_id: 1, username: "student3", password: "1234", full_name: "Priya", role: "STUDENT", status: "ACTIVE", must_change_password: true },
    { id: 4, customer_id: 1, organization_id: 1, username: "admin", password: "admin123", full_name: "College Admin", role: "ORG_ADMIN", status: "ACTIVE", must_change_password: false },
    { id: 5, customer_id: 1, organization_id: null, username: "superadmin", password: "Admin@123", full_name: "Super Administrator", role: "SUPER_ADMIN", status: "ACTIVE", must_change_password: false }
  ],
  complaints: [],
  services: [],
  audits: [],
  next: { users: 6, complaints: 1, services: 1, orgs: 2, customers: 2 }
};

function cloneDemo() { return JSON.parse(JSON.stringify(DEMO)); }
function getDemo() {
  const raw = localStorage.getItem(DEMO_DB_KEY);
  if (raw) return JSON.parse(raw);
  const db = cloneDemo(); localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db)); return db;
}
function saveDemo(db) { localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db)); }
function token() { try { const raw = JSON.parse(sessionStorage.getItem(sessionKey) || "null"); return raw?.token || ""; } catch { return ""; } }
function setSession(payload) {
  sessionStorage.setItem(sessionKey, JSON.stringify(payload));
  state.user = payload.user; state.customer = payload.customer || null; state.organization = payload.organization || null;
}
function clearSession() {
  sessionStorage.removeItem(sessionKey);
  state.user = null; state.customer = null; state.organization = null; state.data = null;
}
function readSession() {
  const raw = sessionStorage.getItem(sessionKey);
  if (!raw) return false;
  try { const p = JSON.parse(raw); state.user = p.user; state.customer = p.customer; state.organization = p.organization; return true; } catch { return false; }
}
function today() { return new Date().toISOString().slice(0, 10); }
function now() { return new Date().toISOString().replace("T", " ").slice(0, 19); }
function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function status(v) { return `<span class="status ${esc(v)}">${esc(v)}</span>`; }
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }
function modal(html) { const d = document.getElementById("modal"); document.getElementById("modalContent").innerHTML = html; d.showModal(); }
function closeModal() { document.getElementById("modal").close(); }
function formValue(id) { return document.getElementById(id)?.value.trim() || ""; }
function htmlButton(text, action, cls="btn-secondary", extra="") { return `<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${esc(text)}</button>`; }

async function call(action, payload = {}) {
  if (!REAL_MODE) return demoCall(action, payload);
  const headers = { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY };
  const session = token();
  if (session) headers["x-smartcampus-session"] = session;
  const res = await fetch(`${CONFIG.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/smartcampus-api`, {
    method: "POST", headers, body: JSON.stringify({ action, ...payload })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function makeDemoSession(user, customer, organization) {
  const t = "demo-" + Math.random().toString(36).slice(2) + Date.now();
  sessionStorage.setItem(sessionKey, JSON.stringify({ token: t, user, customer, organization }));
  return { token: t, user, customer, organization };
}
function demoAuthUser(user) {
  return { id:user.id, customer_id:user.customer_id, organization_id:user.organization_id, username:user.username, full_name:user.full_name, role:user.role, status:user.status, must_change_password:Boolean(user.must_change_password) };
}
function audit(db, userId, customerId, orgId, action, details) { db.audits.push({ id: db.audits.length+1, user_id:userId, customer_id:customerId, organization_id:orgId, action, details, timestamp:now() }); }
function assertDemoSession(db) {
  const raw = sessionStorage.getItem(sessionKey); if (!raw) throw new Error("Please log in first.");
  const p = JSON.parse(raw); const user = db.users.find(u => u.id === p.user.id);
  if (!user || user.status !== "ACTIVE") throw new Error("Your session is no longer active.");
  return { raw:p, user };
}
function orgForUser(db, user) { return db.organizations.find(o => o.id === user.organization_id); }

async function demoCall(action, p) {
  const db = getDemo();
  if (action === "setup_status") return { has_super_admin: db.users.some(u => u.role === "SUPER_ADMIN"), customers_count: db.customers.length };
  if (action === "list_customers") return { customers: db.customers.filter(c => c.status === "ACTIVE") };
  if (action === "list_organizations") return { organizations: db.organizations.filter(o => o.customer_id === Number(p.customer_id) && o.status === "ACTIVE") };
  if (action === "setup_first_customer") {
    // Demo Mode intentionally allows creating additional test customers/Super Admins
    // so the cloud onboarding flow can be tested without a real Supabase project.
    const customerCode = String(p.customer_code || "").trim().toUpperCase();
    const customerName = String(p.customer_name || "").trim();
    const username = String(p.username || "").trim();
    if (db.customers.some(c => c.code.toLowerCase() === customerCode.toLowerCase())) throw new Error("That customer code is already in use in Demo Mode.");
    if (db.users.some(u => u.role === "SUPER_ADMIN" && u.username.toLowerCase() === username.toLowerCase())) throw new Error("That Super Admin username is already in use in Demo Mode.");
    const cid = db.next.customers++;
    const customer = { id:cid, code:customerCode, name:customerName, status:"ACTIVE" };
    db.customers.push(customer);
    db.users.push({ id:db.next.users++, customer_id:cid, organization_id:null, username, password:p.password, full_name:p.full_name, role:"SUPER_ADMIN", status:"ACTIVE", must_change_password:false });
    saveDemo(db);
    return { success:true, customer:{...customer}, customer_id:cid, customer_code:customerCode, username };
  }
  if (action === "login_org") {
    const org = db.organizations.find(o => o.id === Number(p.organization_id) && o.status === "ACTIVE");
    if (!org) throw new Error("This organization is not active.");
    const u = db.users.find(x => x.organization_id === org.id && x.username === p.username && ["STUDENT","ORG_ADMIN"].includes(x.role));
    if (!u || u.password !== p.password || u.status !== "ACTIVE") { audit(db,null,org.customer_id,org.id,"LOGIN_FAILED",`username=${p.username}`); saveDemo(db); throw new Error("Invalid username or password."); }
    const customer = db.customers.find(c => c.id === org.customer_id); const s = makeDemoSession(demoAuthUser(u), customer, org); audit(db,u.id,u.customer_id,org.id,"LOGIN_SUCCESS",`role=${u.role}`); saveDemo(db); return s;
  }
  if (action === "login_super") {
    const customerId = Number(p.customer_id);
    const username = String(p.username || "").trim();
    const password = String(p.password || "");
    const u = db.users.find(x => x.role === "SUPER_ADMIN" && x.customer_id === customerId && String(x.username).trim().toLowerCase() === username.toLowerCase());
    if (!u || u.password !== password || u.status !== "ACTIVE") {
      throw new Error(`Access denied. Check Customer ID ${customerId}, username "${username}", and password.`);
    }
    const customer = db.customers.find(c => c.id === u.customer_id);
    if (!customer) throw new Error("The selected Customer ID no longer exists.");
    const s = makeDemoSession(demoAuthUser(u), customer, null);
    audit(db,u.id,u.customer_id,null,"SUPER_ADMIN_LOGIN_SUCCESS",null);
    saveDemo(db);
    return s;
  }
  if (action === "register_student") {
    const org = db.organizations.find(o => o.id === Number(p.organization_id) && o.status === "ACTIVE"); if (!org) throw new Error("That organization is not available.");
    if (db.users.some(u => u.organization_id === org.id && u.username.toLowerCase() === p.username.toLowerCase())) throw new Error("That username is already taken in this organization.");
    const u = { id:db.next.users++, customer_id:org.customer_id, organization_id:org.id, username:p.username, password:p.password, full_name:p.full_name, role:"STUDENT", status:"ACTIVE", must_change_password:false };
    db.users.push(u); saveDemo(db); return { success:true };
  }
  if (action === "get_me") { const s=assertDemoSession(db); const org=orgForUser(db,s.user); return { user:demoAuthUser(s.user), customer:db.customers.find(c=>c.id===s.user.customer_id), organization:org || null }; }
  if (action === "logout") { sessionStorage.removeItem(sessionKey); return {success:true}; }
  const s = assertDemoSession(db), u = s.user; const org = orgForUser(db,u); const sameOrg = (id) => u.role === "SUPER_ADMIN" ? db.organizations.find(o=>o.id===id && o.customer_id===u.customer_id) : (u.organization_id===id ? org : null);
  if (action === "change_password") { if (u.password !== p.current_password) throw new Error("Current password is incorrect."); if (p.new_password.length<6) throw new Error("Password must be at least 6 characters."); u.password=p.new_password; u.must_change_password=false; audit(db,u.id,u.customer_id,u.id===null?null:u.organization_id,"PASSWORD_CHANGED",null); saveDemo(db); return {success:true}; }
  if (u.role === "STUDENT") {
    if (!org) throw new Error("Organization not found.");
    if (action === "student_create_complaint") { let priority=p.priority; if (["Electricity","Water"].includes(p.category)) priority="High"; const row={id:db.next.complaints++,customer_id:u.customer_id,organization_id:org.id,student_user_id:u.id,student_name:u.full_name,category:p.category,description:p.description,priority,status:"Pending",complaint_date:today()}; db.complaints.unshift(row); audit(db,u.id,u.customer_id,org.id,"COMPLAINT_CREATED",`id=${row.id} category=${p.category}`); saveDemo(db); return {id:row.id}; }
    if (action === "student_list_complaints") return { complaints:db.complaints.filter(c=>c.organization_id===org.id&&c.student_user_id===u.id).map(x=>({...x})) };
    if (action === "student_create_service") { const row={id:db.next.services++,customer_id:u.customer_id,organization_id:org.id,student_user_id:u.id,student_name:u.full_name,service:p.service,description:p.description,status:"Pending",request_date:today()}; db.services.unshift(row); audit(db,u.id,u.customer_id,org.id,"SERVICE_REQUEST_CREATED",`id=${row.id}`); saveDemo(db); return {id:row.id}; }
    if (action === "student_list_services") return { requests:db.services.filter(r=>r.organization_id===org.id&&r.student_user_id===u.id).map(x=>({...x})) };
  }
  if (u.role === "ORG_ADMIN") {
    if (!org) throw new Error("Organization not found.");
    if (action === "org_students") return { students:db.users.filter(x=>x.organization_id===org.id&&x.role==="STUDENT").sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(demoAuthUser) };
    if (action === "org_set_student_status") { const t=db.users.find(x=>x.id===Number(p.user_id)&&x.organization_id===org.id&&x.role==="STUDENT"); if(!t) throw new Error("Student not found in your organization."); t.status=p.status; audit(db,u.id,u.customer_id,org.id,"USER_STATUS_CHANGED",`userId=${t.id} status=${p.status}`); saveDemo(db); return {success:true}; }
    if (action === "org_complaints") return { complaints:db.complaints.filter(c=>c.organization_id===org.id) };
    if (action === "org_set_complaint_status") { const c=db.complaints.find(x=>x.id===Number(p.complaint_id)&&x.organization_id===org.id); if(!c) throw new Error("Complaint not found in your organization."); c.status=p.status; audit(db,u.id,u.customer_id,org.id,"COMPLAINT_STATUS_CHANGED",`id=${c.id} status=${p.status}`); saveDemo(db); return {success:true}; }
    if (action === "org_delete_complaint") { const i=db.complaints.findIndex(x=>x.id===Number(p.complaint_id)&&x.organization_id===org.id); if(i<0) throw new Error("Complaint not found in your organization."); const [c]=db.complaints.splice(i,1); audit(db,u.id,u.customer_id,org.id,"COMPLAINT_DELETED",`id=${c.id}`); saveDemo(db); return {success:true}; }
    if (action === "org_services") return { requests:db.services.filter(c=>c.organization_id===org.id) };
    if (action === "org_set_service_status") { const r=db.services.find(x=>x.id===Number(p.request_id)&&x.organization_id===org.id); if(!r) throw new Error("Service request not found in your organization."); r.status=p.status; audit(db,u.id,u.customer_id,org.id,"SERVICE_STATUS_CHANGED",`id=${r.id} status=${p.status}`); saveDemo(db); return {success:true}; }
    if (action === "org_delete_service") { const i=db.services.findIndex(x=>x.id===Number(p.request_id)&&x.organization_id===org.id); if(i<0) throw new Error("Service request not found in your organization."); const [r]=db.services.splice(i,1); audit(db,u.id,u.customer_id,org.id,"SERVICE_REQUEST_DELETED",`id=${r.id}`); saveDemo(db); return {success:true}; }
    if (action === "org_summary") { const cs=db.complaints.filter(c=>c.organization_id===org.id); const m={}; cs.forEach(c=>{ (m[c.category]??=(new Set())).add(c.student_name); }); return {summary:Object.entries(m).map(([category,set])=>({category,total_complaints:[...cs].filter(c=>c.category===category).length,students_who_reported:[...set]}))}; }
  }
  if (u.role === "SUPER_ADMIN") {
    if (action === "super_organizations") return { organizations:db.organizations.filter(o=>o.customer_id===u.customer_id).sort((a,b)=>a.name.localeCompare(b.name)) };
    if (action === "super_create_organization") { if(!p.code||!p.name) throw new Error("All fields are required."); if(db.organizations.some(o=>o.customer_id===u.customer_id&&o.code.toLowerCase()===p.code.toLowerCase())) throw new Error("That organization code is already in use."); const o={id:db.next.orgs++,customer_id:u.customer_id,code:p.code.toUpperCase(),name:p.name,status:p.status||"ACTIVE",created_at:now()}; db.organizations.push(o); audit(db,u.id,u.customer_id,o.id,"ORGANIZATION_CREATED",`code=${o.code}`); saveDemo(db); return {success:true,id:o.id}; }
    if (action === "super_set_organization_status") { const o=sameOrg(Number(p.organization_id)); if(!o) throw new Error("Organization not found."); o.status=p.status; audit(db,u.id,u.customer_id,o.id,"ORGANIZATION_STATUS_CHANGED",`status=${p.status}`); saveDemo(db); return {success:true}; }
    if (action === "super_org_admins") return { admins:db.users.filter(x=>x.customer_id===u.customer_id&&x.role==="ORG_ADMIN").map(x=>({...demoAuthUser(x),organization_name:db.organizations.find(o=>o.id===x.organization_id)?.name||"?"})) };
    if (action === "super_create_org_admin") { const o=sameOrg(Number(p.organization_id)); if(!o) throw new Error("Organization not found."); if(db.users.some(x=>x.organization_id===o.id&&x.username.toLowerCase()===p.username.toLowerCase())) throw new Error("That username is already taken in this organization."); const a={id:db.next.users++,customer_id:u.customer_id,organization_id:o.id,username:p.username,password:p.temp_password,full_name:p.full_name,role:"ORG_ADMIN",status:"ACTIVE",must_change_password:true}; db.users.push(a); audit(db,u.id,u.customer_id,o.id,"ORG_ADMIN_CREATED",`adminId=${a.id}`); saveDemo(db); return {success:true,id:a.id}; }
    if (action === "super_reset_org_admin_password") { const a=db.users.find(x=>x.id===Number(p.user_id)&&x.customer_id===u.customer_id&&x.role==="ORG_ADMIN"); if(!a) throw new Error("Admin not found."); a.password=p.temp_password; a.must_change_password=true; audit(db,u.id,u.customer_id,a.organization_id,"ORG_ADMIN_PASSWORD_RESET",`adminId=${a.id}`); saveDemo(db); return {success:true}; }
    if (action === "super_set_user_status") { const t=db.users.find(x=>x.id===Number(p.user_id)&&x.customer_id===u.customer_id&&["STUDENT","ORG_ADMIN"].includes(x.role)); if(!t) throw new Error("User not found."); t.status=p.status; audit(db,u.id,u.customer_id,t.organization_id,"USER_STATUS_CHANGED",`userId=${t.id} status=${p.status}`); saveDemo(db); return {success:true}; }
    if (action === "super_students") return { students:db.users.filter(x=>x.customer_id===u.customer_id&&x.role==="STUDENT").map(x=>({...demoAuthUser(x),organization_name:db.organizations.find(o=>o.id===x.organization_id)?.name||"?"})) };
    if (action === "super_complaints") { let rows=db.complaints.filter(c=>c.customer_id===u.customer_id); if(p.organization_id) rows=rows.filter(c=>c.organization_id===Number(p.organization_id)); return {complaints:rows}; }
    if (action === "super_services") { let rows=db.services.filter(r=>r.customer_id===u.customer_id); if(p.organization_id) rows=rows.filter(r=>r.organization_id===Number(p.organization_id)); return {requests:rows}; }
    if (action === "super_statistics") { const orgs=db.organizations.filter(o=>o.customer_id===u.customer_id); return {stats:orgs.map(o=>({organization:o.name,students:db.users.filter(x=>x.customer_id===u.customer_id&&x.organization_id===o.id&&x.role==="STUDENT").length,complaints:db.complaints.filter(x=>x.organization_id===o.id).length,pending:db.complaints.filter(x=>x.organization_id===o.id&&x.status==="Pending").length,resolved:db.complaints.filter(x=>x.organization_id===o.id&&x.status==="Resolved").length,service_requests:db.services.filter(x=>x.organization_id===o.id).length}))}; }
  }
  throw new Error("Unsupported action or insufficient permission.");
}

function layout(content, subtitle="") {
  const logged = state.user;
  return `<div class="topbar"><div class="container topbar-inner"><div class="brand"><div class="brand-mark">SC</div><div>Smart Campus<small>${logged ? esc(state.customer?.name || "") + (state.user?.role === "SUPER_ADMIN" && state.customer?.id ? ` • Customer ID ${esc(state.customer.id)}` : "") : "Complaint & Service Management System"}</small></div></div><div class="nav-actions">${logged ? htmlButton("Logout","logout","btn-secondary") : ""}</div></div></div>${content}<div class="footer">Smart Campus Web Edition • Converted from the supplied Java desktop application</div>`;
}
function authView() {
  return layout(`<main class="page"><div class="container"><section class="hero"><div class="hero-grid"><div><span class="badge">WEB EDITION</span><h1>Campus issues,<br>managed smarter.</h1><p>Students can submit complaints and service requests online. Organization Admins manage their campus. Super Admins manage organizations and users within their customer.</p><div class="hero-badges"><span class="badge">Multi-organization</span><span class="badge">Role-based access</span><span class="badge">Live cloud data</span></div></div><div class="hero-card"><h3>One system for the whole campus</h3><p>Browser-based replacement for the Swing screens in the supplied project. The local demo works immediately; production mode connects to a Supabase project.</p><div style="margin-top:20px">${REAL_MODE ? '<span class="badge">Cloud mode configured</span>' : '<span class="badge">Demo mode active</span>'}</div></div></div></section>${authCard()}</div></main>`);
}
function authCard() {
  return `<section class="card auth-card"><div class="auth-head"><h2>${state.loginMode === "organization" ? "Organization Login" : "Super Admin Login"}</h2><p>${state.loginMode === "organization" ? "Students and Organization Admins" : "Customer-scoped Super Admin access"}</p></div><div class="auth-body"><div class="tabs"><button class="tab ${state.loginMode==='organization'?'active':''}" data-action="switch-login-org">Organization Login</button><button class="tab ${state.loginMode==='super'?'active':''}" data-action="switch-login-super">Super Admin</button></div>${state.loginMode === "organization" ? organizationLoginForm() : superLoginForm()}${!REAL_MODE ? '<div class="notice warning" style="margin-top:16px"><strong>Demo Mode:</strong> student1 / 1234, admin / admin123, superadmin / Admin@123. Demo data is stored only in this browser.<div style="margin-top:10px">'+htmlButton('Reset Demo Data','reset-demo','btn-warning btn-sm')+'</div></div>' : '<div class="notice" style="margin-top:16px">Production mode uses your Supabase project. Do not put a service-role key in this page.</div>'}</div></section>`;
}
function organizationLoginForm() {
  return `<form id="orgLoginForm" class="form-grid"><div class="form-grid two"><div class="field"><label>Customer</label><select id="loginCustomer"><option value="">Loading...</option></select></div><div class="field"><label>Organization</label><select id="loginOrg"><option value="">Select customer first</option></select></div></div><div class="field"><label>Username</label><input id="loginUser" autocomplete="username" required></div><div class="field"><label>Password</label><input id="loginPass" type="password" autocomplete="current-password" required></div><button class="btn btn-primary" type="submit">LOGIN</button><button class="btn btn-ghost" type="button" data-action="register">New Student? Register Here</button></form>`;
}
function superLoginForm() {
  return `<form id="superLoginForm" class="form-grid"><div class="field"><label>Customer</label><select id="superCustomer"><option value="">Loading...</option></select></div><div class="field"><label>Username</label><input id="superUser" required></div><div class="field"><label>Password</label><input id="superPass" type="password" required></div><button class="btn btn-primary" type="submit">LOGIN AS SUPER ADMIN</button><button class="btn btn-ghost" type="button" data-action="first-setup">First-time customer + Super Admin setup</button></form>`;
}

async function render() {
  readSession();
  if (state.user && REAL_MODE) {
    try { const r = await call("get_me"); state.user = r.user; state.customer = r.customer; state.organization = r.organization; const raw = JSON.parse(sessionStorage.getItem(sessionKey)); raw.user = r.user; raw.customer = r.customer; raw.organization = r.organization; sessionStorage.setItem(sessionKey, JSON.stringify(raw)); }
    catch { clearSession(); }
  }
  if (!state.user) { state.view="login"; document.getElementById("app").innerHTML=authView(); await populateAuthSelectors(); bind(); return; }
  if (state.user.role === "STUDENT") document.getElementById("app").innerHTML = layout(await studentDashboard());
  else if (state.user.role === "ORG_ADMIN") document.getElementById("app").innerHTML = layout(await orgDashboard());
  else document.getElementById("app").innerHTML = layout(await superDashboard());
  bind();
  if (state.user.must_change_password) { setTimeout(()=>toast("Your account has a temporary/demo password. Please change it."), 200); }
}

async function populateAuthSelectors() {
  try {
    const r=await call("list_customers"); state.customers=r.customers||[];
    const c1=document.getElementById("loginCustomer"); const c2=document.getElementById("superCustomer");
    const opts=state.customers.map(c=>`<option value="${c.id}">${esc(c.name)} (${esc(c.code)}) • Customer ID ${esc(c.id)}</option>`).join("");
    if(c1){c1.innerHTML='<option value="">Select customer</option>'+opts;c1.addEventListener('change',()=>loadOrgsInto("loginOrg",c1.value));}
    if(c2){c2.innerHTML='<option value="">Select customer</option>'+opts; const preferred=state.pendingSuperLogin?.customerId != null ? String(state.pendingSuperLogin.customerId) : (state.selectedSuperCustomerId != null ? String(state.selectedSuperCustomerId) : (state.customers[0] ? String(state.customers[0].id) : "")); if(preferred) c2.value=preferred;}
    const su=document.getElementById("superUser"); if(su && state.pendingSuperLogin?.username) su.value=state.pendingSuperLogin.username;
    const sp=document.getElementById("superPass"); if(sp && state.pendingSuperLogin?.password) sp.value=state.pendingSuperLogin.password;
    if(c1 && state.customers[0]) { c1.value=state.customers[0].id; await loadOrgsInto("loginOrg",c1.value); }
  } catch(e) { toast(e.message); }
}
async function loadOrgsInto(selectId, customerId) {
  const s=document.getElementById(selectId); if(!s)return; s.innerHTML='<option value="">Loading...</option>'; if(!customerId){s.innerHTML='<option value="">Select customer first</option>';return;}
  try { const r=await call("list_organizations",{customer_id:Number(customerId)}); state.organizations=r.organizations||[]; s.innerHTML='<option value="">Select organization</option>'+state.organizations.map(o=>`<option value="${o.id}">${esc(o.name)} (${esc(o.code)})</option>`).join(""); } catch(e){s.innerHTML='<option value="">Unable to load</option>';toast(e.message);}
}

async function studentDashboard() {
  const complaints=await call("student_list_complaints").then(r=>r.complaints||[]).catch(()=>[]); const services=await call("student_list_services").then(r=>r.requests||[]).catch(()=>[]);
  return `<main class="page"><div class="container"><div class="dashboard-header"><div><h1>Welcome, ${esc(state.user.full_name)}</h1><p>${esc(state.organization?.name||"")} • Student Dashboard</p></div><div>${status(state.user.status)}</div></div><div class="stats"><div class="card stat"><small>My Complaints</small><strong>${complaints.length}</strong></div><div class="card stat"><small>Resolved</small><strong>${complaints.filter(x=>x.status==='Resolved').length}</strong></div><div class="card stat"><small>Service Requests</small><strong>${services.length}</strong></div><div class="card stat"><small>Pending</small><strong>${complaints.filter(x=>x.status==='Pending').length+services.filter(x=>x.status==='Pending').length}</strong></div></div><div class="menu-grid"><div class="card menu-card"><h3>My Profile</h3><p>View your name, username, organization and role.</p>${htmlButton("Open","profile")}</div><div class="card menu-card"><h3>Register Complaint</h3><p>Report Wi-Fi, classroom, cleanliness, electricity, water or other campus issues.</p>${htmlButton("Register Complaint","new-complaint","btn-primary")}</div><div class="card menu-card"><h3>My Complaints</h3><p>Track your submitted complaints and their status.</p>${htmlButton("View Complaints","student-complaints")}</div><div class="card menu-card"><h3>Service Request</h3><p>Request ID card replacement, bonafide certificate, transport pass or other services.</p>${htmlButton("Request Service","new-service","btn-primary")}</div><div class="card menu-card"><h3>My Service Requests</h3><p>Track service requests submitted by you.</p>${htmlButton("View Requests","student-services")}</div><div class="card menu-card"><h3>Change Password</h3><p>Replace a temporary/demo password with your own password.</p>${htmlButton("Change Password","change-password")}</div></div></div></main>`;
}
async function orgDashboard() {
  const [students, complaints, services]=await Promise.all([call("org_students"),call("org_complaints"),call("org_services")]);
  return `<main class="page"><div class="container"><div class="dashboard-header"><div><h1>${esc(state.organization?.name||"Organization")}</h1><p>Organization Admin Dashboard • ${esc(state.user.full_name)}</p></div>${status(state.user.status)}</div><div class="stats"><div class="card stat"><small>Students</small><strong>${students.students?.length||0}</strong></div><div class="card stat"><small>Complaints</small><strong>${complaints.complaints?.length||0}</strong></div><div class="card stat"><small>Pending Complaints</small><strong>${(complaints.complaints||[]).filter(x=>x.status==='Pending').length}</strong></div><div class="card stat"><small>Service Requests</small><strong>${services.requests?.length||0}</strong></div></div><div class="menu-grid"><div class="card menu-card"><h3>Students</h3><p>Activate or deactivate students in your organization.</p>${htmlButton("Manage Students","org-students")}</div><div class="card menu-card"><h3>Complaints</h3><p>Update complaint status or delete organization complaints.</p>${htmlButton("Manage Complaints","org-complaints","btn-primary")}</div><div class="card menu-card"><h3>Service Requests</h3><p>Update service-request status or delete requests.</p>${htmlButton("Manage Requests","org-services","btn-primary")}</div><div class="card menu-card"><h3>Complaint Summary</h3><p>See complaint totals by category and the students who reported each category.</p>${htmlButton("View Summary","org-summary")}</div><div class="card menu-card"><h3>Change Password</h3><p>Change your Organization Admin password.</p>${htmlButton("Change Password","change-password")}</div><div class="card menu-card"><h3>Refresh</h3><p>Reload the latest counts and data from the central database.</p>${htmlButton("Refresh Dashboard","refresh","btn-secondary")}</div></div></div></main>`;
}
async function superDashboard() {
  const [orgs,students,complaints,services]=await Promise.all([call("super_organizations"),call("super_students"),call("super_complaints"),call("super_services")]);
  return `<main class="page"><div class="container"><div class="dashboard-header"><div><h1>Super Admin Console</h1><p>${esc(state.customer?.name||"")} • Manage every organization in your customer</p></div>${status(state.user.status)}</div><div class="stats"><div class="card stat"><small>Organizations</small><strong>${orgs.organizations?.length||0}</strong></div><div class="card stat"><small>Students</small><strong>${students.students?.length||0}</strong></div><div class="card stat"><small>Complaints</small><strong>${complaints.complaints?.length||0}</strong></div><div class="card stat"><small>Service Requests</small><strong>${services.requests?.length||0}</strong></div></div><div class="menu-grid"><div class="card menu-card"><h3>Organizations</h3><p>View and activate/deactivate organizations under your customer.</p>${htmlButton("Manage Organizations","super-orgs")}</div><div class="card menu-card"><h3>Create Organization</h3><p>Add a new organization under this customer.</p>${htmlButton("Create Organization","create-org","btn-primary")}</div><div class="card menu-card"><h3>Organization Admins</h3><p>View admins, reset temporary passwords, and manage status.</p>${htmlButton("Manage Admins","super-admins")}</div><div class="card menu-card"><h3>Create Org Admin</h3><p>Create an Organization Admin for a selected organization.</p>${htmlButton("Create Admin","create-admin","btn-primary")}</div><div class="card menu-card"><h3>Students</h3><p>View all students across your customer's organizations.</p>${htmlButton("View Students","super-students")}</div><div class="card menu-card"><h3>Complaints</h3><p>View complaints from all or one organization.</p>${htmlButton("View Complaints","super-complaints")}</div><div class="card menu-card"><h3>Service Requests</h3><p>View service requests from all or one organization.</p>${htmlButton("View Requests","super-services")}</div><div class="card menu-card"><h3>Statistics</h3><p>Compare counts by organization without changing any underlying data.</p>${htmlButton("View Statistics","super-stats")}</div><div class="card menu-card"><h3>Change Password</h3><p>Change your Super Admin password.</p>${htmlButton("Change Password","change-password")}</div></div></div></main>`;
}

function renderRows(columns, rows) {
  const columnCount = Array.isArray(columns) ? columns.length : (rows?.[0]?.length || 0);
  if (!rows?.length) return `<tr><td colspan="${columnCount}" class="empty">No records found.</td></tr>`;
  return rows.map(row => {
    const cells = Array.isArray(row) ? row : [row];
    return `<tr>${cells.map(cell => {
      const value = typeof cell === "function" ? cell(row) : cell;
      return `<td>${value ?? ""}</td>`;
    }).join("")}</tr>`;
  }).join("");
}
function tableCard(title, head, rows) { return `<section class="section"><div class="section-title"><h2>${esc(title)}</h2></div><div class="card table-wrap"><table><thead><tr>${head.map(x=>`<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></section>`; }

async function showStudentComplaints() { const r=await call("student_list_complaints"); modal(`<h2>My Complaints</h2>${tableCard("",["ID","Category","Description","Priority","Status","Date"],renderRows([1,2,3,4,5,6],(r.complaints||[]).map(c=>[()=>c.id,()=>esc(c.category),()=>esc(c.description),()=>esc(c.priority),()=>status(c.status),()=>esc(c.complaint_date)])) )}`); }
async function showStudentServices() { const r=await call("student_list_services"); modal(`<h2>My Service Requests</h2>${tableCard("",["ID","Service","Description","Status","Date"],renderRows([1,2,3,4,5],(r.requests||[]).map(x=>[()=>x.id,()=>esc(x.service),()=>esc(x.description),()=>status(x.status),()=>esc(x.request_date)])) )}`); }
function profileModal() { modal(`<h2>My Profile</h2><div class="form-grid"><div class="notice"><strong>Full Name</strong><br>${esc(state.user.full_name)}</div><div class="notice"><strong>Username</strong><br>${esc(state.user.username)}</div><div class="notice"><strong>Customer</strong><br>${esc(state.customer?.name||"")}</div><div class="notice"><strong>Organization</strong><br>${esc(state.organization?.name||"All Organizations")}</div><div class="notice"><strong>Role</strong><br>${esc(state.user.role)}</div></div>`); }
function complaintForm() { modal(`<h2>Register Complaint</h2><div class="form-grid"><div class="notice">Submitting as <strong>${esc(state.user.full_name)}</strong> in <strong>${esc(state.organization.name)}</strong>.</div><div class="field"><label>Category</label><select id="mCategory"><option>Wi-Fi</option><option>Classroom</option><option>Cleanliness</option><option>Electricity</option><option>Water</option><option>Other</option></select></div><div class="field"><label>Description</label><textarea id="mDescription" required></textarea></div><div class="field"><label>Priority</label><select id="mPriority"><option>Low</option><option>Medium</option><option>High</option></select></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="button" class="btn btn-primary" data-action="submit-complaint">Submit</button></div></div>`); }
function serviceForm() { modal(`<h2>Service Request</h2><div class="form-grid"><div class="notice">Submitting as <strong>${esc(state.user.full_name)}</strong> in <strong>${esc(state.organization.name)}</strong>.</div><div class="field"><label>Service</label><select id="mService"><option>ID Card Replacement</option><option>Bonafide Certificate</option><option>Transport Pass</option><option>Other</option></select></div><div class="field"><label>Description</label><textarea id="mDescription" required></textarea></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="button" class="btn btn-primary" data-action="submit-service">Submit</button></div></div>`); }
function passwordModal() { modal(`<h2>Change Password</h2><div class="form-grid"><div class="field"><label>Current Password</label><input id="mCurrent" type="password"></div><div class="field"><label>New Password</label><input id="mNew" type="password"></div><div class="field"><label>Confirm New Password</label><input id="mConfirm" type="password"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="button" class="btn btn-primary" data-action="submit-password">Update Password</button></div></div>`); }
function setupModal() { modal(`<h2>First-time Customer + Super Admin Setup</h2><div class="notice">This replaces the desktop app's first-run Super Admin setup. It creates the first customer and its Super Admin together.</div><div class="form-grid"><div class="field"><label>Customer Name</label><input id="mCustomerName"></div><div class="field"><label>Customer Code</label><input id="mCustomerCode" placeholder="CUST001"></div><div class="field"><label>Super Admin Full Name</label><input id="mFullName"></div><div class="field"><label>Super Admin Username</label><input id="mUsername"></div><div class="field"><label>Password (minimum 8)</label><input id="mPassword" type="password"></div><div class="field"><label>Confirm Password</label><input id="mConfirm" type="password"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="button" class="btn btn-primary" data-action="submit-setup">Create</button></div></div>`); }
function registerModal() { modal(`<h2>Student Registration</h2><div class="form-grid"><div class="field"><label>Customer</label><select id="mCustomer"></select></div><div class="field"><label>Organization</label><select id="mOrg"></select></div><div class="field"><label>Full Name</label><input id="mFullName"></div><div class="field"><label>Username</label><input id="mUsername"></div><div class="field"><label>Password (minimum 6)</label><input id="mPassword" type="password"></div><div class="field"><label>Confirm Password</label><input id="mConfirm" type="password"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="button" class="btn btn-primary" data-action="submit-register">Create Account</button></div></div>`); setTimeout(async()=>{ const c=document.getElementById('mCustomer'); c.innerHTML=state.customers.map(x=>`<option value="${x.id}">${esc(x.name)} (${esc(x.code)})</option>`).join(''); if(state.customers[0])await fillModalOrgs(state.customers[0].id); c.addEventListener('change',()=>fillModalOrgs(c.value)); },0); }
async function fillModalOrgs(customerId){const s=document.getElementById('mOrg'); if(!s)return; const r=await call('list_organizations',{customer_id:Number(customerId)}); s.innerHTML=(r.organizations||[]).map(o=>`<option value="${o.id}">${esc(o.name)} (${esc(o.code)})</option>`).join('')||'<option value="">No active organizations</option>';}
function createOrgModal(){ modal(`<h2>Create Organization</h2><div class="form-grid"><div class="field"><label>Organization Name</label><input id="mOrgName"></div><div class="field"><label>Organization Code</label><input id="mOrgCode"></div><div class="field"><label>Status</label><select id="mOrgStatus"><option>ACTIVE</option><option>INACTIVE</option></select></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="button" class="btn btn-primary" data-action="submit-create-org">Create Organization</button></div></div>`); }
async function createAdminModal(){const r=await call('super_organizations'); modal(`<h2>Create Organization Admin</h2><div class="form-grid"><div class="field"><label>Organization</label><select id="mOrg">${(r.organizations||[]).map(o=>`<option value="${o.id}">${esc(o.name)} (${esc(o.code)})</option>`).join('')}</select></div><div class="field"><label>Full Name</label><input id="mFullName"></div><div class="field"><label>Username</label><input id="mUsername"></div><div class="field"><label>Temporary Password (minimum 6)</label><input id="mPassword" type="password"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="button" class="btn btn-primary" data-action="submit-create-admin">Create Admin</button></div></div>`); }
function resetAdminModal(id){modal(`<h2>Reset Organization Admin Password</h2><div class="field"><label>Temporary Password (minimum 6)</label><input id="mPassword" type="password"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="button" class="btn btn-primary" data-action="submit-reset-admin" data-id="${id}">Reset Password</button></div>`);}

async function showOrgStudents(){const r=await call('org_students'); modal(`<h2>Students</h2>${tableCard('',["ID","Username","Full Name","Status","Action"],renderRows([1,2,3,4,5],(r.students||[]).map(s=>[()=>s.id,()=>esc(s.username),()=>esc(s.full_name),()=>status(s.status),()=>htmlButton(s.status==='ACTIVE'?'Deactivate':'Activate',`toggle-student:${s.id}:${s.status==='ACTIVE'?'INACTIVE':'ACTIVE'}`,s.status==='ACTIVE'?'btn-danger btn-sm':'btn-success btn-sm')])) )}`);}
async function showOrgComplaints(){const r=await call('org_complaints'); modal(`<h2>Complaints</h2>${tableCard('',["ID","Student","Category","Description","Priority","Status","Date","Action"],renderRows([1,2,3,4,5,6,7,8],(r.complaints||[]).map(c=>[()=>c.id,()=>esc(c.student_name),()=>esc(c.category),()=>esc(c.description),()=>esc(c.priority),()=>status(c.status),()=>esc(c.complaint_date),()=>`<div class="actions">${htmlButton('Pending',`set-complaint:${c.id}:Pending`,'btn-warning btn-sm')}${htmlButton('In Progress',`set-complaint:${c.id}:In Progress`,'btn-secondary btn-sm')}${htmlButton('Resolved',`set-complaint:${c.id}:Resolved`,'btn-success btn-sm')}${htmlButton('Delete',`delete-complaint:${c.id}`,'btn-danger btn-sm')}</div>`])) )}`); }
async function showOrgServices(){const r=await call('org_services'); modal(`<h2>Service Requests</h2>${tableCard('',["ID","Student","Service","Description","Status","Date","Action"],renderRows([1,2,3,4,5,6,7],(r.requests||[]).map(x=>[()=>x.id,()=>esc(x.student_name),()=>esc(x.service),()=>esc(x.description),()=>status(x.status),()=>esc(x.request_date),()=>`<div class="actions">${htmlButton('Pending',`set-service:${x.id}:Pending`,'btn-warning btn-sm')}${htmlButton('In Progress',`set-service:${x.id}:In Progress`,'btn-secondary btn-sm')}${htmlButton('Resolved',`set-service:${x.id}:Resolved`,'btn-success btn-sm')}${htmlButton('Delete',`delete-service:${x.id}`,'btn-danger btn-sm')}</div>`])) )}`); }
async function showOrgSummary(){const r=await call('org_summary'); modal(`<h2>Complaint Summary</h2>${tableCard('',["Category","Total Complaints","Students Who Reported It"],renderRows([1,2,3],(r.summary||[]).map(x=>[()=>esc(x.category),()=>x.total_complaints,()=>esc((x.students_who_reported||[]).join(', '))])) )}`); }
async function showSuperOrgs(){const r=await call('super_organizations'); modal(`<h2>Organizations</h2>${tableCard('',["ID","Code","Name","Status","Created","Action"],renderRows([1,2,3,4,5,6],(r.organizations||[]).map(o=>[()=>o.id,()=>esc(o.code),()=>esc(o.name),()=>status(o.status),()=>esc(o.created_at),()=>htmlButton(o.status==='ACTIVE'?'Deactivate':'Activate',`toggle-org:${o.id}:${o.status==='ACTIVE'?'INACTIVE':'ACTIVE'}`,o.status==='ACTIVE'?'btn-danger btn-sm':'btn-success btn-sm')])) )}`); }
async function showSuperAdmins(){const r=await call('super_org_admins'); modal(`<h2>Organization Admins</h2>${tableCard('',["ID","Organization","Username","Full Name","Status","Action"],renderRows([1,2,3,4,5,6],(r.admins||[]).map(a=>[()=>a.id,()=>esc(a.organization_name),()=>esc(a.username),()=>esc(a.full_name),()=>status(a.status),()=>`<div class="actions">${htmlButton('Reset Password',`reset-admin:${a.id}`,'btn-warning btn-sm')}${htmlButton(a.status==='ACTIVE'?'Deactivate':'Activate',`toggle-user:${a.id}:${a.status==='ACTIVE'?'INACTIVE':'ACTIVE'}`,a.status==='ACTIVE'?'btn-danger btn-sm':'btn-success btn-sm')}</div>`])) )}`); }
async function showSuperStudents(){const r=await call('super_students'); modal(`<h2>All Students</h2>${tableCard('',["ID","Organization","Username","Full Name","Status"],renderRows([1,2,3,4,5],(r.students||[]).map(s=>[()=>s.id,()=>esc(s.organization_name),()=>esc(s.username),()=>esc(s.full_name),()=>status(s.status)])))}`); }
async function showSuperComplaints(){const o=await call('super_organizations'); modal(`<h2>All Complaints</h2><div class="filter-row"><div class="field"><label>Organization filter</label><select id="mFilterOrg"><option value="">ALL ORGANIZATIONS</option>${(o.organizations||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div></div><div id="mDynamic"></div>`); const s=document.getElementById('mFilterOrg'); const load=async()=>{const r=await call('super_complaints',{organization_id:s.value||null}); document.getElementById('mDynamic').innerHTML=tableCard('',["ID","Organization","Student","Category","Description","Priority","Status","Date"],renderRows([1,2,3,4,5,6,7,8],(r.complaints||[]).map(c=>[()=>c.id,()=>esc((o.organizations||[]).find(x=>x.id===c.organization_id)?.name||'?'),()=>esc(c.student_name),()=>esc(c.category),()=>esc(c.description),()=>esc(c.priority),()=>status(c.status),()=>esc(c.complaint_date)])));}; s.addEventListener('change',load); await load(); }
async function showSuperServices(){const o=await call('super_organizations'); modal(`<h2>All Service Requests</h2><div class="filter-row"><div class="field"><label>Organization filter</label><select id="mFilterOrg"><option value="">ALL ORGANIZATIONS</option>${(o.organizations||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div></div><div id="mDynamic"></div>`); const s=document.getElementById('mFilterOrg'); const load=async()=>{const r=await call('super_services',{organization_id:s.value||null}); document.getElementById('mDynamic').innerHTML=tableCard('',["ID","Organization","Student","Service","Description","Status","Date"],renderRows([1,2,3,4,5,6,7],(r.requests||[]).map(x=>[()=>x.id,()=>esc((o.organizations||[]).find(y=>y.id===x.organization_id)?.name||'?'),()=>esc(x.student_name),()=>esc(x.service),()=>esc(x.description),()=>status(x.status),()=>esc(x.request_date)])));}; s.addEventListener('change',load); await load(); }
async function showSuperStats(){const r=await call('super_statistics'); modal(`<h2>Statistics</h2>${tableCard('',["Organization","Students","Complaints","Pending","Resolved","Service Requests"],renderRows([1,2,3,4,5,6],(r.stats||[]).map(x=>[()=>esc(x.organization),()=>x.students,()=>x.complaints,()=>x.pending,()=>x.resolved,()=>x.service_requests])))}`);}

function bind() {
  if (!window.__smartCampusActionBound) {
    window.__smartCampusActionBound = true;
    document.addEventListener('click', async (event) => {
      const el = event.target.closest('[data-action]');
      if (!el) return;
      const a = el.dataset.action;
      try {
        if(a==='switch-login-org'){state.loginMode='organization';await render();return;}
        if(a==='switch-login-super'){state.loginMode='super';await render();return;}
        if(a==='register'){registerModal();return;}
        if(a==='first-setup'){setupModal();return;}
        if(a==='close-modal'){closeModal();return;}
        if(a==='reset-demo'){if(confirm('Reset all Demo Mode data in this browser? This cannot be undone.')){localStorage.removeItem(DEMO_DB_KEY);sessionStorage.removeItem(sessionKey);state.selectedSuperCustomerId=null;state.pendingSuperLogin=null;state.loginMode='organization';state.user=null;state.customer=null;state.organization=null;await render();toast('Demo data reset.');}return;}
        if(a==='profile'){profileModal();return;}
        if(a==='new-complaint'){complaintForm();return;}
        if(a==='student-complaints'){await showStudentComplaints();return;}
        if(a==='new-service'){serviceForm();return;}
        if(a==='student-services'){await showStudentServices();return;}
        if(a==='change-password'){passwordModal();return;}
        if(a==='logout'){await call('logout').catch(()=>{});clearSession();await render();return;}
        if(a==='refresh'){await render();return;}
        if(a==='org-students'){await showOrgStudents();return;}
        if(a==='org-complaints'){await showOrgComplaints();return;}
        if(a==='org-services'){await showOrgServices();return;}
        if(a==='org-summary'){await showOrgSummary();return;}
        if(a==='super-orgs'){await showSuperOrgs();return;}
        if(a==='create-org'){createOrgModal();return;}
        if(a==='super-admins'){await showSuperAdmins();return;}
        if(a==='create-admin'){await createAdminModal();return;}
        if(a==='super-students'){await showSuperStudents();return;}
        if(a==='super-complaints'){await showSuperComplaints();return;}
        if(a==='super-services'){await showSuperServices();return;}
        if(a==='super-stats'){await showSuperStats();return;}
        if(a==='submit-setup'){await submitSetup();return;}
        if(a==='login-pending-super'){
          const p=state.pendingSuperLogin;
          if(!p) throw new Error('No newly created Super Admin is waiting to log in.');
          // Demo mode can safely create a local session from the just-created user.
          // Production mode must still authenticate through the Edge Function.
          const r=await call('login_super',{customer_id:Number(p.customerId),username:p.username,password:p.password});
          setSession(r);
          state.pendingSuperLogin=null;
          state.selectedSuperCustomerId=null;
          closeModal();
          await render();
          return;
        }
        if(a==='submit-register'){await submitRegister();return;}
        if(a==='submit-complaint'){await submitComplaint();return;}
        if(a==='submit-service'){await submitService();return;}
        if(a==='submit-password'){await submitPassword();return;}
        if(a==='submit-create-org'){await submitCreateOrg();return;}
        if(a==='submit-create-admin'){await submitCreateAdmin();return;}
        if(a.startsWith('toggle-student:')){const [_,id,st]=a.split(':');await call('org_set_student_status',{user_id:Number(id),status:st});closeModal();await showOrgStudents();toast('Student status updated.');return;}
        if(a.startsWith('set-complaint:')){const [_,id,st]=a.split(':');await call('org_set_complaint_status',{complaint_id:Number(id),status:st});closeModal();await showOrgComplaints();toast('Complaint status updated.');return;}
        if(a.startsWith('delete-complaint:')){const id=Number(a.split(':')[1]);if(confirm(`Delete complaint ${id}?`)){await call('org_delete_complaint',{complaint_id:id});closeModal();await showOrgComplaints();toast('Complaint deleted.');}return;}
        if(a.startsWith('set-service:')){const [_,id,st]=a.split(':');await call('org_set_service_status',{request_id:Number(id),status:st});closeModal();await showOrgServices();toast('Service request status updated.');return;}
        if(a.startsWith('delete-service:')){const id=Number(a.split(':')[1]);if(confirm(`Delete service request ${id}?`)){await call('org_delete_service',{request_id:id});closeModal();await showOrgServices();toast('Service request deleted.');}return;}
        if(a.startsWith('toggle-org:')){const [_,id,st]=a.split(':');await call('super_set_organization_status',{organization_id:Number(id),status:st});closeModal();await showSuperOrgs();toast('Organization status updated.');return;}
        if(a.startsWith('toggle-user:')){const [_,id,st]=a.split(':');await call('super_set_user_status',{user_id:Number(id),status:st});closeModal();await showSuperAdmins();toast('User status updated.');return;}
        if(a.startsWith('reset-admin:')){resetAdminModal(Number(a.split(':')[1]));return;}
        if(a==='submit-reset-admin'){const id=Number(el.dataset.id); const pass=formValue('mPassword'); if(pass.length<6)throw new Error('Password must be at least 6 characters.'); await call('super_reset_org_admin_password',{user_id:id,temp_password:pass});closeModal();await showSuperAdmins();toast('Temporary password reset.');return;}
      } catch(e) { toast(e.message || 'Something went wrong.'); }
    });
  }

  // These forms are recreated by render(), so their submit handlers must be rebound each render.
  document.getElementById('orgLoginForm')?.addEventListener('submit', async e=>{
    e.preventDefault();
    try{const r=await call('login_org',{organization_id:Number(formValue('loginOrg')),username:formValue('loginUser'),password:document.getElementById('loginPass').value});setSession(r);await render();}
    catch(x){toast(x.message);}
  });
  document.getElementById('superLoginForm')?.addEventListener('submit', async e=>{
    e.preventDefault();
    try{
      const customerId=Number(formValue('superCustomer'));
      const username=formValue('superUser');
      const password=document.getElementById('superPass').value;
      if(!customerId) throw new Error('Please select a Customer.');
      if(!username) throw new Error('Please enter the Super Admin username.');
      if(!password) throw new Error('Please enter the password.');
      const r=await call('login_super',{customer_id:customerId,username,password});
      setSession(r); state.pendingSuperLogin=null; state.selectedSuperCustomerId=null; await render();
    }
    catch(x){toast(x.message);}
  });
}

async function submitSetup(){
  const customer_name=formValue('mCustomerName'),customer_code=formValue('mCustomerCode'),full_name=formValue('mFullName'),username=formValue('mUsername'),password=document.getElementById('mPassword').value,confirmPass=document.getElementById('mConfirm').value;
  if(!customer_name||!customer_code||!full_name||!username||!password)throw new Error('Please fill all fields.');
  if(username.length<3)throw new Error('Username must be at least 3 characters.');
  if(password.length<8)throw new Error('Password must be at least 8 characters.');
  if(password!==confirmPass)throw new Error('Passwords do not match.');
  const r=await call('setup_first_customer',{customer_name,customer_code,full_name,username,password});
  const createdCustomer=r.customer || {id:r.customer_id,code:r.customer_code,name:customer_name};
  if(!createdCustomer.id) throw new Error('Customer was created, but the Customer ID was not returned. Please refresh and check the customer list before logging in.');
  state.selectedSuperCustomerId=createdCustomer.id;
  state.pendingSuperLogin={customerId:createdCustomer.id,username,password,user:r.user || null,customer:createdCustomer};
  state.loginMode='super';
  closeModal();
  await render();
  modal(`<h2>Super Admin Created Successfully</h2><div class="notice success">Your customer and Super Admin account have been created successfully.</div><div class="info-grid"><div><strong>Customer ID</strong><span>${esc(createdCustomer.id)}</span></div><div><strong>Customer Code</strong><span>${esc(createdCustomer.code)}</span></div><div><strong>Customer Name</strong><span>${esc(createdCustomer.name)}</span></div><div><strong>Super Admin Username</strong><span>${esc(username)}</span></div><div><strong>Password</strong><span>${esc(password)}</span></div></div><p class="muted" style="margin-top:14px">The Super Admin login screen is already prepared with this Customer ID and username. Click Continue to Login and then click Login.</p><div class="modal-actions"><button type="button" class="btn btn-primary" data-action="login-pending-super">LOGIN NOW</button><button type="button" class="btn btn-secondary" data-action="close-modal">CONTINUE TO LOGIN</button></div>`);
}
async function submitRegister(){const orgId=Number(formValue('mOrg')),full_name=formValue('mFullName'),username=formValue('mUsername'),password=document.getElementById('mPassword').value,confirmPass=document.getElementById('mConfirm').value;if(!orgId||!full_name||!username||!password)throw new Error('Please fill all fields.');if(password.length<6)throw new Error('Password must be at least 6 characters.');if(password!==confirmPass)throw new Error('Passwords do not match.');await call('register_student',{organization_id:orgId,full_name,username,password});closeModal();toast('Account created. You can now log in.');}
async function submitComplaint(){const desc=formValue('mDescription');if(!desc)throw new Error('Please enter a description.');const r=await call('student_create_complaint',{category:formValue('mCategory'),description:desc,priority:formValue('mPriority')});closeModal();toast(`Complaint submitted. ID: ${r.id}`);await render();}
async function submitService(){const desc=formValue('mDescription');if(!desc)throw new Error('Please enter a description.');const r=await call('student_create_service',{service:formValue('mService'),description:desc});closeModal();toast(`Request sent. ID: ${r.id}`);await render();}
async function submitPassword(){const cur=document.getElementById('mCurrent').value,newp=document.getElementById('mNew').value,conf=document.getElementById('mConfirm').value;if(!cur||!newp)throw new Error('Please fill all fields.');if(newp.length<6)throw new Error('Password must be at least 6 characters.');if(newp!==conf)throw new Error('Passwords do not match.');await call('change_password',{current_password:cur,new_password:newp});state.user.must_change_password=false;const raw=JSON.parse(sessionStorage.getItem(sessionKey));raw.user.must_change_password=false;sessionStorage.setItem(sessionKey,JSON.stringify(raw));closeModal();toast('Password updated.');await render();}
async function submitCreateOrg(){const name=formValue('mOrgName'),code=formValue('mOrgCode'),statusV=formValue('mOrgStatus');if(!name||!code)throw new Error('Please fill all fields.');await call('super_create_organization',{name,code,status:statusV});closeModal();toast('Organization created.');await render();}
async function submitCreateAdmin(){const organization_id=Number(formValue('mOrg')),full_name=formValue('mFullName'),username=formValue('mUsername'),temp_password=document.getElementById('mPassword').value;if(!organization_id||!full_name||!username||temp_password.length<6)throw new Error('Please provide all fields; password must be at least 6 characters.');await call('super_create_org_admin',{organization_id,full_name,username,temp_password});closeModal();toast('Organization Admin created.');await render();}

(async()=>{
  await render();
})();
