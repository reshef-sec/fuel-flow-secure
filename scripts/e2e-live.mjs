/**
 * Live end-to-end verification over HTTP — every role and workflow, A to Z.
 *
 *   node scripts/e2e-live.mjs https://<service>.onrender.com
 *
 * SAFETY: it writes real data (accounts, cards, vehicle pools, a system reset), so it
 * REFUSES to run unless the target database is empty (needs_setup === true).
 * Point it at a staging service with its own empty MongoDB database — never production.
 * NOT YET UPDATED for email sign-in: it still activates accounts with a national id and needs
 * rewriting before its next use. The local checks are server/tests/ (npm test).
 */
const BASE = (process.argv[2] ?? process.env.E2E_BASE_URL ?? "").replace(/\/$/, "");
if (!BASE) { console.error("Usage: node scripts/e2e-live.mjs <base-url>"); process.exit(2); }
const ORIGIN = new URL(BASE).origin;
const OWNER_ID = process.env.E2E_OWNER_ID ?? "300000001";
const PW = "E2eTest2026x";

const results = [];
let section = "";
const sec = (s) => { section = s; console.log(`\n■ ${s}`); };
function check(name, ok, detail = "") {
  results.push({ section, name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  → ${detail}` : ""}`);
}

/** Minimal cookie-jar client (one per user). */
function client() {
  const jar = new Map();
  async function req(method, path, body) {
    const headers = { Origin: ORIGIN };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const v = kv.slice(i + 1);
      if (v) jar.set(kv.slice(0, i), v); else jar.delete(kv.slice(0, i));
    }
    let json = null;
    try { json = await res.json(); } catch { /* html */ }
    return { status: res.status, data: json?.data, body: json, error: json?.error };
  }
  return {
    get: (p) => req("GET", p),
    post: (p, b = {}) => req("POST", p, b),
    rpc: (n, b = {}) => req("POST", `/api/rpc/${n}`, b),
    db: (t, b) => req("POST", `/api/db/${t}`, b),
  };
}

const fmt = (r) => `${r.status} ${r.error ?? JSON.stringify(r.data ?? r.body)?.slice(0, 120)}`;

async function activate(nationalId, phone) {
  const c = client();
  const login = await c.post("/api/auth/login", { phone, password: nationalId });
  const change = await c.post("/api/auth/change-password", { password: PW });
  return { c, ok: login.status === 200 && login.body?.profile?.is_first_login === true && change.status === 200, login, change };
}

// ───────────────────────────── 0. Safety guard ─────────────────────────────
const anon = client();
const health = await anon.get("/api/health");
const setup = await anon.rpc("needs_setup");
if (health.status !== 200 || setup.data !== true) {
  console.error(`Refusing to run: ${BASE} ${health.status !== 200 ? "is not healthy" : "already has an admin (database not empty)"}.`);
  console.error("This suite writes test data and resets the system. Run it against an EMPTY staging database only.");
  process.exit(3);
}

// ───────────────────────── 1. Initial admin setup & auth ─────────────────────────
sec("1. Initial admin setup & auth");
const owner = client();
check("empty database reports needs_setup", setup.data === true);
const boot = await owner.post("/api/accounts", { action: "bootstrap", phone: "0500000001", nationalId: OWNER_ID, fullName: "מאיה קורן" });
check("bootstrap first admin", boot.status === 200, fmt(boot));
check("bootstrap closes after first admin", (await anon.post("/api/accounts", { action: "bootstrap", phone: "0500000009", nationalId: "300000009", fullName: "x" })).status === 403);
const l1 = await owner.post("/api/auth/login", { phone: "050-000-0001", password: OWNER_ID });
check("first login with ת.ז → is_first_login: true", l1.status === 200 && l1.body.profile.is_first_login === true, fmt(l1));
for (const [what, r] of [
  ["table API", await owner.db("vouchers", { op: "select" })],
  ["business RPC", await owner.rpc("get_central_inventory_snapshot")],
  ["accounts admin action", await owner.post("/api/accounts", { action: "sync", phone: "0500000002", nationalId: "300000002" })],
  ["notifications", await owner.get("/api/notifications?since=2020-01-01")],
]) check(`locked before password change: ${what} → 403`, r.status === 403, fmt(r));
for (const pw of ["Ab1", "onlyletters", "1234567890", OWNER_ID]) {
  const r = await owner.post("/api/auth/change-password", { password: pw });
  check(`non-compliant password rejected: "${pw}"`, r.status === 400, fmt(r));
}
const ch = await owner.post("/api/auth/change-password", { password: PW });
check("compliant password accepted", ch.status === 200 && ch.body.profile.is_first_login === false, fmt(ch));
check("modules unlocked after change", (await owner.db("vouchers", { op: "select" })).status === 200);
check("initial ת.ז password no longer works", (await client().post("/api/auth/login", { phone: "0500000001", password: OWNER_ID })).status === 401);
check("new password works", (await client().post("/api/auth/login", { phone: "0500000001", password: PW })).status === 200);

// Staff directory → each user activates through the real first-login flow.
const STAFF = [
  { national_id: "300000002", last_name: "שני", first_name: "אדמין", role: "admin", phone: "0500000002", branch: "" },
  { national_id: "300000003", last_name: "מנהל", first_name: "חיפה", role: "branch", phone: "0500000003", branch: "חיפה" },
  { national_id: "300000004", last_name: "מנהל", first_name: "תא", role: "branch", phone: "0500000004", branch: "תל אביב" },
  { national_id: "300000005", last_name: "כהן", first_name: "דני", role: "supervisor", phone: "0500000005", branch: "חיפה" },
  { national_id: "300000006", last_name: "צופה", first_name: "רון", role: "viewer", phone: "0500000006", branch: "" },
  { national_id: "300000007", last_name: "נעול", first_name: "בודק", role: "supervisor", phone: "0500000007", branch: "חיפה" },
];
check("admin creates branches", (await owner.db("branches", { op: "insert", values: [{ id: "e2e-hf", name: "חיפה" }, { id: "e2e-ta", name: "תל אביב" }] })).status === 200);
const addStaff = await owner.db("app_users", { op: "insert", values: STAFF.map((s) => ({ ...s, requires_password_change: true })) });
check("admin adds staff (admin, 2 branch managers, supervisor, viewer)", addStaff.status === 200, fmt(addStaff));
const U = {};
for (const [key, s] of [["admin2", STAFF[0]], ["hf", STAFF[1]], ["ta", STAFF[2]], ["sup", STAFF[3]], ["viewer", STAFF[4]]]) {
  const a = await activate(s.national_id, s.phone);
  check(`${s.role} ${s.first_name}: first login forced → password set`, a.ok, `${fmt(a.login)} / ${fmt(a.change)}`);
  U[key] = a.c;
}

sec("1b. Account lockout");
const lock = client();
check("lock-test user activates", (await lock.post("/api/auth/login", { phone: "0500000007", password: "300000007" })).status === 200);
for (let i = 1; i <= 5; i += 1) {
  const r = await client().post("/api/auth/login", { phone: "0500000007", password: `Wrong${i}abc` });
  check(`failed attempt ${i} → 401`, r.status === 401, fmt(r));
}
const locked = await client().post("/api/auth/login", { phone: "0500000007", password: "300000007" });
check("correct password during lock → 429 (15-minute lock)", locked.status === 429, fmt(locked));

// ───────────────────────────── 2. RBAC ─────────────────────────────
sec("2a. Admin + development tools (owner only)");
check("owner: can_use_development_tools = true", (await owner.rpc("can_use_development_tools")).data === true);
check("second admin: can_use_development_tools = false", (await U.admin2.rpc("can_use_development_tools")).data === false);
for (const k of ["admin2", "hf", "sup", "viewer"]) {
  check(`${k}: generate_demo_data → 403`, (await U[k].rpc("generate_demo_data")).status === 403);
  check(`${k}: reset_development_data → 403`, (await U[k].rpc("reset_development_data", { p_confirmation: "איפוס וניקוי נתונים" })).status === 403);
}
const demo = await owner.rpc("generate_demo_data");
check("owner: demo seeding creates cards", demo.status === 200 && demo.data?.vouchers_created > 0, fmt(demo));
const seeded = await owner.db("vouchers", { op: "select" });
check("demo cards respect denominations", seeded.data?.length > 0 && seeded.data.every((v) => (v.fuel_type === "סולר" ? v.amount % 100 === 0 : v.amount % 50 === 0)));
check("reset without exact confirmation → rejected", (await owner.rpc("reset_development_data", { p_confirmation: "איפוס" })).status !== 200);
const reset = await owner.rpc("reset_development_data", { p_confirmation: "איפוס וניקוי נתונים" });
check("owner: system reset succeeds", reset.status === 200, fmt(reset));
check("reset cleared operational data", (await owner.db("vouchers", { op: "select" })).data?.length === 0);
check("reset kept staff & branches", (await owner.db("app_users", { op: "select" })).data?.length === STAFF.length + 1 && (await owner.db("branches", { op: "select" })).data?.length === 2);

// ───────────────────────────── 3. Inventory & business logic ─────────────────────────────
sec("3a. Inventory import");
const rows = [
  ...[1, 2, 3, 4, 5, 6].map((i) => ({ serial: `P100-${i}`, real_code: `RC-P${i}`, amount: 100, fuel_type: "בנזין" })),
  ...[1, 2, 3, 4].map((i) => ({ serial: `D100-${i}`, real_code: `RC-D${i}`, amount: 100, fuel_type: "סולר" })),
  { serial: "000777", real_code: "RC-777", amount: 200, fuel_type: "בנזין" },
  { serial: "888", real_code: "RC-888", amount: 200, fuel_type: "בנזין" },
];
const imp = await owner.rpc("import_voucher_inventory", { p_rows: rows });
check("import 12 cards", imp.status === 200 && imp.data?.added === 12, fmt(imp));
const imp2 = await owner.rpc("import_voucher_inventory", { p_rows: rows.slice(0, 2) });
check("re-import never overwrites (skipped)", imp2.data?.added === 0 && imp2.data?.skipped === 2, fmt(imp2));
check("invalid row (75 ₪) rejected", (await owner.rpc("import_voucher_inventory", { p_rows: [{ serial: "BAD", real_code: "x", amount: 75, fuel_type: "סולר" }] })).status === 400);
const all = await owner.db("vouchers", { op: "select" });
check("redemption codes never returned by the table API", all.data?.every((v) => !("real_code" in v)));
const snap = await owner.rpc("get_central_inventory_snapshot");
check("admin: central inventory snapshot", snap.status === 200, fmt(snap));
check("branch manager: snapshot is admin-only → 403", (await U.hf.rpc("get_central_inventory_snapshot")).status === 403);

sec("4a. Vehicle pools — work vehicles (delta sync)");
const wv = (std, code) => ({ client_code: code, account_name: `חשבון ${code}`, client_name: `לקוח ${code}`, branch: "חיפה", standard: std, is_active: true });
const w1 = await owner.rpc("sync_work_vehicles", { p_rows: [wv("80620031", "1"), wv("80620032", "2"), wv("80620033", "3"), {}, {}] });
check("upload 3 rows + 2 trailing blanks", w1.status === 200 && w1.data?.added === 3, fmt(w1));
const w2 = await owner.rpc("sync_work_vehicles", { p_rows: [wv("80620031", "1"), wv("80620033", "3")] });
check("re-upload omitting 1 row → deactivated: 1", w2.data?.deactivated === 1, fmt(w2));
const b2b = (await owner.db("b2b_clients", { op: "select" })).data ?? [];
const gone = b2b.find((r) => r.standard === "80620032");
check("omitted record kept (never deleted)", b2b.length === 3 && Boolean(gone), `rows=${b2b.length}`);
check("omitted record is_active: false (לא פעיל)", gone?.is_active === false);
const w3 = await owner.rpc("sync_work_vehicles", { p_rows: [wv("80620031", "1"), wv("80620032", "2"), wv("80620033", "3")] });
check("re-adding the row reactivates it", w3.data?.reactivated === 1, fmt(w3));
check("empty file rejected (no mass deactivation)", (await owner.rpc("sync_work_vehicles", { p_rows: [{}, {}] })).status !== 200);
for (const k of ["hf", "sup", "viewer"]) check(`${k}: sync_work_vehicles → 403`, (await U[k].rpc("sync_work_vehicles", { p_rows: [wv("1", "1")] })).status === 403);

sec("4b. Vehicle pools — private vehicles (delta sync)");
const pv = (c, s) => ({ client_id: c, site_id: s, client_name: `לקוח ${c}`, site_name: `אתר ${s}`, is_active: true });
const p1 = await owner.rpc("sync_private_vehicles", { p_rows: [pv("E2E", "1"), pv("E2E", "2"), {}] });
check("upload 2 rows (+blank)", p1.status === 200 && p1.data?.added === 2, fmt(p1));
const p2 = await owner.rpc("sync_private_vehicles", { p_rows: [pv("E2E", "1")] });
check("re-upload omitting 1 row → deactivated: 1", p2.data?.deactivated === 1, fmt(p2));
const regs = (await owner.db("regular_clients", { op: "select" })).data ?? [];
check("omitted private vehicle kept with is_active: false", regs.length === 2 && regs.find((r) => r.site_id === "2")?.is_active === false);

sec("3b. Denominations, concurrency, isolation");
const REG = { route: "regular", client_id: "E2E", site_id: "1" };
const link = (id) => ({ id, employee_name: `עובד ${id}` });
const issue = (c, items, branch, id, sup = null) => c.rpc("issue_voucher_to_worker", { p_items: items, p_branch: branch, p_supervisor: sup, p_link: link(id) });
check("בנזין 150 ₪ rejected (multiples of 100)", (await issue(owner, [{ amount: 150, fuel_type: "בנזין", details: REG }], "מאגר ראשי", "710001")).status !== 200);
check("סולר 75 ₪ rejected (multiples of 50)", (await issue(owner, [{ amount: 75, fuel_type: "סולר", details: REG }], "מאגר ראשי", "710002")).status !== 200);
const inactive = await issue(owner, [{ amount: 100, fuel_type: "בנזין", details: { route: "regular", client_id: "E2E", site_id: "2" } }], "מאגר ראשי", "710003");
check("issuance to inactive vehicle blocked", inactive.status !== 200, fmt(inactive));

const race = await Promise.all(Array.from({ length: 20 }, (_, i) => issue(owner, [{ amount: 100, fuel_type: "בנזין", details: REG }], "מאגר ראשי", String(720000 + i))));
const won = race.filter((r) => r.status === 200);
const serials = won.flatMap((r) => r.data.vouchers.map((v) => v.serial));
check("20 concurrent issuances for 6 cards → exactly 6 succeed", won.length === 6, `succeeded=${won.length}`);
check("zero duplicate card assignments", new Set(serials).size === serials.length && serials.length === 6, serials.join(","));
check("losers get the shortage error (no inventory, no issuance)", race.filter((r) => r.status !== 200).every((r) => r.status === 400));

const tr = await owner.rpc("transfer_voucher_stock", { p_items: [{ amount: 200, fuel_type: "סולר", serials: ["D100-1", "D100-2"] }], p_branch: "חיפה", p_supervisor: "כהן דני" });
check("admin allocates 2 diesel cards to חיפה / supervisor כהן דני", tr.status === 200, fmt(tr));
const tr2 = await owner.rpc("transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "סולר", serials: ["D100-3"] }], p_branch: "תל אביב" });
check("admin allocates 1 diesel card to תל אביב", tr2.status === 200, fmt(tr2));
const ser = (r) => (r.data ?? []).map((v) => v.serial).sort().join(",");
check("branch manager חיפה sees only חיפה cards", ser(await U.hf.db("vouchers", { op: "select" })) === "D100-1,D100-2", ser(await U.hf.db("vouchers", { op: "select" })));
check("branch manager תל אביב sees only תל אביב cards", ser(await U.ta.db("vouchers", { op: "select" })) === "D100-3", ser(await U.ta.db("vouchers", { op: "select" })));
check("supervisor sees only cards assigned to them", ser(await U.sup.db("vouchers", { op: "select" })) === "D100-1,D100-2", ser(await U.sup.db("vouchers", { op: "select" })));
await U.hf.db("vouchers", { op: "update", values: { status: "חסום" }, filters: [{ col: "serial", op: "eq", value: "D100-3" }] });
check("branch manager cannot modify another branch's card", (await owner.db("vouchers", { op: "select", filters: [{ col: "serial", op: "eq", value: "D100-3" }] })).data?.[0]?.status === "טרם שומש");
check("branch manager cannot issue for another branch → 403", (await issue(U.hf, [{ amount: 100, fuel_type: "סולר", details: REG }], "תל אביב", "730001")).status === 403);
const supIssue = await issue(U.sup, [{ amount: 100, fuel_type: "סולר", details: REG }], "חיפה", "730002", "כהן דני");
check("supervisor issues from own stock", supIssue.status === 200, fmt(supIssue));
check("supervisor cannot issue fuel they don't hold (shortage)", (await issue(U.sup, [{ amount: 100, fuel_type: "בנזין", details: REG }], "חיפה", "730003", "כהן דני")).status !== 200);
check("supervisor cannot allocate stock → 403", (await U.sup.rpc("transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "סולר", serials: ["D100-4"] }], p_branch: "חיפה" })).status === 403);
const reqIns = await U.sup.db("voucher_requests", { op: "insert", values: { id: "e2e-req-1", requester: "כהן דני", branch: "חיפה", amount: 300, reason: "E2E" } });
check("supervisor can submit a voucher request", reqIns.status === 200, fmt(reqIns));
const notif = await owner.get(`/api/notifications?since=${encodeURIComponent(new Date(Date.now() - 60000).toISOString())}`);
check("admin is notified of the new request", notif.status === 200 && notif.body.requests?.length >= 1, fmt(notif));

sec("2b. Viewer is strictly read-only");
check("viewer reads all cards", (await U.viewer.db("vouchers", { op: "select" })).data?.length === 12);
for (const [name, params] of [
  ["issue_voucher_to_worker", { p_items: [{ amount: 100, fuel_type: "סולר", details: REG }], p_branch: "מאגר ראשי", p_link: link("740001") }],
  ["transfer_voucher_stock", { p_items: [{ amount: 100, fuel_type: "סולר", serials: ["D100-4"] }], p_branch: "חיפה" }],
  ["import_voucher_inventory", { p_rows: [{ serial: "V1", real_code: "x", amount: 100, fuel_type: "בנזין" }] }],
  ["store_voucher_codes", { p_codes: [] }],
  ["reconcile_redeemed_vouchers", { card_numbers: ["888"] }],
  ["sync_work_vehicles", { p_rows: [wv("1", "1")] }],
  ["sync_private_vehicles", { p_rows: [pv("1", "1")] }],
  ["unlock_worker_link", { p_id: "720000" }],
  ["generate_demo_data", {}],
  ["reset_development_data", { p_confirmation: "איפוס וניקוי נתונים" }],
]) check(`viewer RPC ${name} → 403`, (await U.viewer.rpc(name, params)).status === 403);
for (const [t, body] of [
  ["branches", { op: "insert", values: { id: "x", name: "x" } }],
  ["vouchers", { op: "update", values: { status: "חסום" }, filters: [{ col: "serial", op: "eq", value: "D100-4" }] }],
  ["voucher_requests", { op: "insert", values: { id: "v-req" } }],
  ["app_users", { op: "delete", filters: [{ col: "national_id", op: "eq", value: "300000005" }] }],
]) check(`viewer table ${t} ${body.op} → 403`, (await U.viewer.db(t, body)).status === 403);
check("viewer account actions → 403", (await U.viewer.post("/api/accounts", { action: "reset", phone: "0500000005", nationalId: "300000005" })).status === 403);

sec("4c. Paz reconciliation");
const big = await issue(owner, [{ amount: 200, fuel_type: "בנזין", details: REG }], "מאגר ראשי", "750001");
check("card 000777 issued to a worker", big.status === 200 && big.data?.vouchers?.[0]?.serial === "000777", fmt(big));
check("non-admin reconcile → 403", (await U.hf.rpc("reconcile_redeemed_vouchers", { card_numbers: ["777"] })).status === 403);
const paz = await owner.rpc("reconcile_redeemed_vouchers", { card_numbers: ["777", "888.0", "999999"] });
check("Paz file ['777','888.0','999999'] → 2 matched (leading zeros & .0 normalized)", paz.status === 200 && paz.data === 2, fmt(paz));
const after = Object.fromEntries(((await owner.db("vouchers", { op: "select" })).data ?? []).map((v) => [v.serial, v]));
check("issued card 000777 → מומש סופית", after["000777"]?.status === "מומש סופית");
check("available card 888 → מומש סופית", after["888"]?.status === "מומש סופית");
check("redeemed_at recorded, stored number keeps leading zeros", Boolean(after["000777"]?.redeemed_at) && after["000777"]?.serial === "000777");
check("repeat upload is idempotent (0)", (await owner.rpc("reconcile_redeemed_vouchers", { card_numbers: ["777"] })).data === 0);

// ───────────────────────────── Matrix ─────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log("\n══════════════ PASS/FAIL MATRIX ══════════════");
for (const s of [...new Set(results.map((r) => r.section))]) {
  const rs = results.filter((r) => r.section === s);
  console.log(`${rs.every((r) => r.ok) ? "PASS" : "FAIL"}  ${s.padEnd(48)} ${rs.filter((r) => r.ok).length}/${rs.length}`);
}
console.log(`\nTOTAL ${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} FAILED` : " — zero regressions"}`);
process.exit(failed.length ? 1 : 0);
