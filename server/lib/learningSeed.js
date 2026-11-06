/**
 * סביבת לימוד — realistic, internally consistent demo dataset.
 *
 * Always called inside runInLearning(), so the normal models write to the learning_* collections.
 * Deterministic: a seeded PRNG drives every choice (no Math.random / randomUUID), and all dates are
 * offsets from "now", so a reset reproduces the same operation shifted to the current day.
 *
 * Story the data tells (every page computes its figures from these same rows):
 *   - five stock imports (~5 months) → central pool (מאגר ראשי);
 *   - one approved request per branch in the last 3 weeks → branch allocation → part handed on to
 *     supervisors (הקצאה למפקח);
 *   - 45 worker links issued over the last ~3 months (signed / waiting), and older
 *     pre-link issuances; weekly Paz feedback imports mark used cards מומש סופית (redeemed_at =
 *     the import time, exactly like reconcile_redeemed_vouchers);
 *   - activity_log covers the last 3 weeks completely (every import, allocation, issuance, request).
 */
import {
  REAL, Profile, AppUser, AppSetting, Branch, IssueReason, B2BClient, RegularClient, Voucher, VoucherCode,
  VoucherRequest, WorkerLink, SignatureArchive, ActivityLog,
} from "../models.js";
import { MAIN_POOL, STATUS } from "./canonical.js";
import { roleLabel } from "./audit.js";
import { addMonths } from "./issuanceGuard.js";
import { otpFields } from "./workerOtp.js";

const SEED = 0x5eed2611;
const DAY = 864e5;
const LOG_WINDOW = 21; // days of fully-logged activity
const DUMMY_HASH = "!learning-demo-profile-no-login";
/** Demo links open with this code (no SMS is ever sent from the learning environment). */
export const DEMO_OTP = "1234";

// ───────────────────────────── PRNG ─────────────────────────────

function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const chance = (p) => next() < p;
  /** weighted([[value, weight], ...]) */
  const weighted = (pairs) => {
    const total = pairs.reduce((t, [, w]) => t + w, 0);
    let r = next() * total;
    for (const [v, w] of pairs) { r -= w; if (r < 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join("");
  const uuid = () => {
    const h = Array.from({ length: 32 }, () => int(0, 15).toString(16));
    h[12] = "4";
    h[16] = ((parseInt(h[16], 16) & 3) | 8).toString(16);
    const s = h.join("");
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  };
  return { next, int, pick, chance, weighted, digits, uuid };
}

// ───────────────────────────── reference data ─────────────────────────────

const FIRST_M = ["אבי", "אורי", "איתי", "אלון", "עידו", "יוסי", "דני", "משה", "רון", "עומר", "ליאור", "נדב", "גיל", "שחר",
  "תומר", "אריאל", "יונתן", "עמית", "רועי", "אסף", "חיים", "מוטי", "ניר", "קובי", "שי", "יאיר", "דוד", "אמיר", "סאמר", "וליד",
  "יוסף", "אברהם", "מיכאל", "אלכס", "דמיטרי", "ברוך"];
const FIRST_F = ["מיכל", "שירה", "נועה", "יעל", "תמר", "נטע", "רותם", "הדס", "ענבל", "אורית", "סיגל", "מורן", "ליאת", "דנה",
  "גלית", "קרן", "אפרת", "שני", "רחל", "אורטל", "סתיו", "חן"];
const LAST = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "דהן", "אברהם", "פרידמן", "אזולאי", "גבאי", "חדד", "עמר", "שפירא",
  "רוזן", "קליין", "אוחיון", "בן דוד", "אלמוג", "נחום", "יוסף", "שושן", "מלכה", "גולן", "ברק", "טל", "סויסה", "אדרי", "וקנין",
  "חזן", "פישר", "זילברמן", "רבינוביץ", "חלבי", "עזאם", "טקלה", "סלים", "חסון", "נגר", "קורנפלד", "בוזגלו"];

const BRANCHES = [
  { id: "b-haifa", name: "חיפה", city: "חיפה" },
  { id: "b-ta", name: "תל אביב", city: "תל אביב" },
  { id: "b-bs", name: "באר שבע", city: "באר שבע" },
  { id: "b-jlm", name: "ירושלים", city: "ירושלים" },
];

/** [last, first, role, branch, title, can_request] */
const STAFF = [
  ["לוי", "מיכל", "branch", "חיפה", "מנהלת סניף", true],
  ["גבאי", "רון", "branch", "תל אביב", "מנהל סניף", true],
  ["אזולאי", "שירה", "branch", "באר שבע", "מנהלת סניף", true],
  ["פרידמן", "אבי", "branch", "ירושלים", "מנהל סניף", true],
  ["כהן", "דני", "supervisor", "חיפה", "מפקח", true],
  ["פרץ", "יוסי", "supervisor", "חיפה", "מפקח", false],
  ["חדד", "אלון", "supervisor", "חיפה", "מפקח", false],
  ["מזרחי", "עידו", "supervisor", "תל אביב", "מפקח", true],
  ["שפירא", "נטע", "supervisor", "תל אביב", "מפקחת", false],
  ["ביטון", "אורי", "supervisor", "תל אביב", "מפקח", false],
  ["דהן", "משה", "supervisor", "באר שבע", "מפקח", true],
  ["עמר", "ליאור", "supervisor", "באר שבע", "מפקח", false],
  ["רוזן", "יעל", "supervisor", "ירושלים", "מפקחת", true],
  ["קליין", "עומר", "supervisor", "ירושלים", "מפקח", false],
  ["אברהם", "נועה", "viewer", "", "צופה", false],
];

const REASONS = [
  ["תדלוק רכב עבודה", "B2B"], ["סיור ביטחון רכוב", "B2B"], ["נסיעה לאתר לקוח", "B2B"], ["הקפצת צוות לאירוע", "B2B"],
  ["החזר הוצאות רכב פרטי", "Regular"], ["משמרת לילה", "Regular"], ["תגבור אבטחה", "Regular"], ["הדרכה והשתלמות", "Regular"],
];

/** Work-vehicle clients per branch: [client_name, vehicles]. */
const B2B_CLIENTS = {
  "חיפה": [["מרכז לוגיסטי המפרץ", 3], ["פארק תעשיות צפון", 3], ["קריית החינוך הכרמל", 2]],
  "תל אביב": [["מגדלי הים התיכון", 3], ["מתחם הבורסה", 2], ["מרכז כנסים יפו", 3]],
  "באר שבע": [["פארק ההייטק נגב", 2], ["מרכז רפואי דרום", 3], ["אזור תעשייה עמק שרה", 2]],
  "ירושלים": [["קריית המדע הר חוצבים", 3], ["מתחם קניות תלפיות", 2], ["מרכז תחבורה מערב העיר", 2]],
};
const VEHICLE_ROLES = ["סיור רכוב", "רכב מוקד", "רכב קב\"ט", "ניידת אבטחה", "רכב פיקוח", "רכב תגבור"];

/** Private-vehicle clients: [client_name, [site names]]. */
const REGULAR_CLIENTS = [
  ["רשת מרכולים אופק", ["סניף מרכז", "סניף צפון", "מרכז הפצה"]],
  ["מכללת נוף הגליל", ["קמפוס ראשי", "בניין המעבדות", "מעונות"]],
  ["מרכז רפואי השרון החדש", ["בניין אשפוז", "מרפאות חוץ", "חניון עובדים"]],
  ["קבוצת מגדל אור", ["מגדל A", "מגדל B", "לובי מסחרי"]],
  ["רשת בתי ספר תמר", ["תיכון תמר", "חטיבת ביניים", "יסודי גפן"]],
  ["קוונטום-נט מערכות", ["משרדים ראשיים", "חוות שרתים", "מעבדת פיתוח"]],
  ["מלונות חוף הזהב", ["מלון הטיילת", "מלון המרינה", "מתחם אירועים"]],
  ["מוזיאון העיר העתיקה", ["אגף תצוגה", "מחסן אוספים", "שער ראשי"]],
  ["מועצה אזורית גבעות הנגב", ["בניין המועצה", "מרכז קהילתי", "אזור תעשייה"]],
  ["פארק מים גלים", ["שער כניסה", "מתחם בריכות", "חניון"]],
];

/** Paz denominations only: petrol 50/100/500, diesel 100/500. */
const DENOMS = { "בנזין": [[50, 45], [100, 40], [500, 15]], "סולר": [[100, 80], [500, 20]] };

/** An amount as whole cards, largest first: { 500: 2, 100: 1 }. */
function asCards(amount, sizes) {
  const cards = {};
  let left = amount;
  for (const size of sizes) {
    const n = Math.floor(left / size);
    if (n) { cards[size] = n; left -= n * size; }
  }
  return cards;
}

// ───────────────────────────── generator ─────────────────────────────

export async function seedLearning({ owner } = {}) {
  const R = makeRng(SEED);
  const now = new Date();
  const nowMs = now.getTime();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  /** Israel-time wall clock `daysAgo` days back, never later than a minute ago. */
  const at = (daysAgo, hour = 9, minute = 0) =>
    new Date(Math.min(midnight - daysAgo * DAY + ((hour - 2) * 60 + minute) * 60000, nowMs - 60000));
  const day = (d) => d.toISOString().slice(0, 10);
  const daysAgoOf = (d) => Math.floor((midnight + DAY - d.getTime()) / DAY);
  const later = (d, minDays, maxDays) => {
    const t = d.getTime() + R.int(minDays, maxDays) * DAY + R.int(1, 8) * 3600000;
    return new Date(Math.min(t, nowMs - 60000));
  };

  // ── reference data copied from the real system (read-only; never written back) ──
  const ref = await loadReference();

  // ── identities (unique, never colliding with the owner or any real person) ──
  const usedPhones = new Set([String(owner?.phone ?? ""), ...ref.users.map((u) => u.phone), ...ref.profiles.map((p) => p.phone)]);
  const phone = () => {
    for (;;) {
      const p = `05${R.pick(["0", "2", "3", "4", "8"])}${R.digits(7)}`;
      if (!usedPhones.has(p)) { usedPhones.add(p); return p; }
    }
  };

  const ownerName = String(owner?.full_name || "קורן מאיה").trim();
  const [ownerLast, ...ownerFirst] = ownerName.split(/\s+/);
  const ownerActor = { id: owner?.id ?? null, name: ownerName, role: "admin" };

  // ── branches: the real ones when the system has them, otherwise the fictional four ──
  const realBranches = ref.branches.filter((b) => String(b.name ?? "").trim());
  const branchRows = realBranches.length ? realBranches : BRANCHES.map((b) => ({ ...b, manager: "" }));
  const branchNames = branchRows.map((b) => b.name);

  // ── staff: the real users directory (names, roles, branches, phones) when present ──
  const profileById = new Map(ref.profiles.map((p) => [p.id, p]));
  const realStaff = ref.users.filter((u) => ["branch", "supervisor", "viewer"].includes(u.role)
    && u.id !== owner?.id);
  let staff;
  if (realStaff.length) {
    staff = realStaff.map((u) => {
      const p = profileById.get(u.id);
      const last = String(u.last_name ?? "").trim();
      const first = String(u.first_name ?? "").trim();
      return {
        id: u.id, hasProfile: Boolean(p), last, first, name: [last, first].filter(Boolean).join(" ") || p?.full_name || "",
        role: u.role, branch: String(u.branch ?? ""), title: u.title ?? "", canRequest: Boolean(u.can_request),
        email: u.email ?? null, phone: u.phone || p?.phone || "",
      };
    });
  } else {
    staff = fictionalStaff(R, branchNames).map((s) => ({ ...s, id: R.uuid(), hasProfile: false, email: null, phone: phone() }));
  }
  const withProfileFirst = (list) => {
    const p = list.filter((s) => s.hasProfile);
    return p.length ? p : list;
  };
  const managerOf = (b) => {
    const named = branchRows.find((x) => x.name === b)?.manager;
    const mgrs = withProfileFirst(staff.filter((s) => s.role === "branch" && s.branch === b));
    return mgrs.find((s) => s.name === named) ?? mgrs[0];
  };
  const supervisorsOf = (b) => withProfileFirst(staff.filter((s) => s.role === "supervisor" && s.branch === b));
  const requesterOf = (b, preferSupervisor) => {
    const sup = supervisorsOf(b).find((s) => s.canRequest);
    return (preferSupervisor && sup) || managerOf(b) || sup || ownerActor;
  };

  // Branches that actually have people get the activity (allocations, issuance, requests).
  const staffed = branchNames.filter((b) => managerOf(b) || supervisorsOf(b).length);
  const ACT = (staffed.length ? staffed : branchNames).slice(0, 6);

  const appUsers = realStaff.length
    ? ref.users.map(stripDoc)
    : [...ref.users.map(stripDoc), ...staff.map((s) => ({
      id: s.id, email: s.email, last_name: s.last, first_name: s.first, role: s.role, title: s.title,
      phone: s.phone, branch: s.branch, can_request: s.canRequest, requires_password_change: false,
    }))];
  if (!appUsers.some((u) => u.id === owner?.id)) {
    appUsers.unshift({ id: owner?.id, email: owner?.email ?? null, last_name: ownerLast, first_name: ownerFirst.join(" "), role: "admin",
      title: "מנהלת מערכת", phone: owner?.phone, branch: "", can_request: true, requires_password_change: false });
  }
  // Login accounts: copies of the real ones with an unusable password hash (nobody can sign in with them;
  // sign-in always reads the real profiles).
  const profiles = ref.profiles.map((p) => ({
    ...stripDoc(p), password_hash: DUMMY_HASH, token_version: 0, failed_logins: 0, locked_until: null, learning_mode: false,
  }));
  if (!profiles.some((p) => p.id === owner?.id)) {
    profiles.unshift({ id: owner?.id, phone: owner?.phone, email: owner?.email ?? null, full_name: ownerName, branch: owner?.branch ?? "",
      role: "admin", password_hash: DUMMY_HASH, requires_password_change: false, last_login_at: at(0, 8, 12) });
  }
  const branches = realBranches.length
    ? realBranches.map(stripDoc)
    : BRANCHES.map((b) => ({ ...b, manager: managerOf(b.name)?.name ?? "" }));

  const reasons = ref.reasons.length ? ref.reasons.map(stripDoc) : REASONS.map(([name, category]) => ({ id: R.uuid(), name, category }));
  const reasonsFor = (route) => {
    const want = route === "b2b" ? "B2B" : "Regular";
    const own = reasons.filter((r) => (r.category === "B2B" ? "B2B" : "Regular") === want).map((r) => r.name);
    return own.length ? own : reasons.map((r) => r.name);
  };

  // ── vehicle pools: real pools copied as they are; fictional only when a pool is empty ──
  const b2b = ref.b2b.length ? ref.b2b.map(stripDoc) : [];
  const usedStandards = new Set();
  let clientCode = 3100 + R.int(0, 300);
  for (const bName of ref.b2b.length ? [] : ACT) {
    for (const [clientName, vehicles] of B2B_CLIENTS[bName] ?? GENERIC_B2B) {
      clientCode += R.int(17, 240);
      for (let i = 0; i < vehicles; i += 1) {
        let standard;
        do standard = `806${R.digits(5)}`; while (usedStandards.has(standard));
        usedStandards.add(standard);
        b2b.push({
          id: R.uuid(), client_code: String(clientCode), standard, branch: bName, client_name: clientName,
          account_name: `${R.pick(VEHICLE_ROLES)} · ${clientName}`, balance: String(R.int(8, 60) * 250),
          load_type: "דלק", budget_section: String(4100 + R.int(0, 8) * 10), account_key: `${clientCode}${R.digits(3)}`,
          item_family: "דלק לרכב", account_status: "פעיל", account_type: "תקן רכב", is_active: true,
        });
      }
    }
  }
  if (!ref.b2b.length) for (const i of [4, 15, 26]) if (b2b[i]) Object.assign(b2b[i], { is_active: false, account_status: "לא פעיל" });

  const regular = ref.regular.length ? ref.regular.map(stripDoc) : [];
  let clientId = 52000 + R.int(0, 900);
  for (const [clientName, sites] of ref.regular.length ? [] : REGULAR_CLIENTS) {
    clientId += R.int(40, 700);
    let siteId = R.int(1, 9);
    for (const siteName of sites) {
      regular.push({ id: R.uuid(), client_id: String(clientId), client_name: clientName, site_id: String(siteId),
        site_name: siteName, standard: `7${R.digits(3)}`, is_active: true });
      siteId += R.int(1, 6);
    }
  }
  if (!ref.regular.length) for (const i of [5, 16, 28]) regular[i].is_active = false;

  // ── workers (employees who receive cards) ──
  const usedNames = new Set([...staff.map((s) => s.name), ...ref.profiles.map((p) => p.full_name)]);
  const workers = [];
  for (let i = 0; i < 64; i += 1) {
    let name;
    do name = `${R.pick(LAST)} ${R.chance(0.72) ? R.pick(FIRST_M) : R.pick(FIRST_F)}`; while (usedNames.has(name));
    usedNames.add(name);
    workers.push({ name, phone: phone(), branch: ACT[i % ACT.length] });
  }
  const workersOf = (b) => workers.filter((w) => w.branch === b);

  // ── stock imports (batches) and card factory ──
  const BATCHES = [
    { daysAgo: 158, prefix: "70418", width: 5, next: 1200 + R.int(0, 400), n: 0 },
    { daysAgo: 118, prefix: "70452", width: 5, next: 300 + R.int(0, 400), n: 0 },
    { daysAgo: 79, prefix: "8124", width: 5, next: 10000 + R.int(0, 5000), n: 0 }, // 9-digit card numbers
    { daysAgo: 38, prefix: "70489", width: 5, next: 2000 + R.int(0, 400), n: 0 },
    { daysAgo: 9, prefix: "70511", width: 5, next: 100 + R.int(0, 400), n: 0 },
    { daysAgo: 9, prefix: "0063", width: 6, next: 140000 + R.int(0, 9000), n: 0 }, // leading zeros
  ];
  for (const b of BATCHES) b.time = at(b.daysAgo, 10, R.int(0, 59));
  const usedCodes = new Set();
  const vouchers = [];
  const codes = [];
  /** A batch imported at least `margin` days before `daysAgo` (never the small leading-zero batch). */
  const batchBefore = (daysAgo, margin = 2) => {
    const ok = BATCHES.slice(0, 5).filter((b) => b.daysAgo >= daysAgo + margin);
    return ok.length ? R.pick(ok) : BATCHES[0];
  };
  /** Unissued stock is under 3 months old; older cards expire (see lib/expireStock.js). */
  const recentBatch = () => R.weighted([[BATCHES[2], 20], [BATCHES[3], 40], [BATCHES[4], 40]]);
  const card = (fuel, amount, batch, extra = {}) => {
    const serial = `${batch.prefix}${String(batch.next).padStart(batch.width, "0")}`;
    batch.next += 1;
    batch.n += 1;
    let code;
    do code = `${R.int(1, 9)}${R.digits(11)}`; while (usedCodes.has(code));
    usedCodes.add(code);
    const v = {
      serial, card_number: serial, real_code: "", amount, fuel_type: fuel, branch: MAIN_POOL, supervisor: null,
      supervisor_id: null, status: STATUS.AVAILABLE, updated_on: day(batch.time), created_at: batch.time, ...extra,
    };
    vouchers.push(v);
    codes.push({ serial, card_number: serial, real_code: code, redemption_code: code, created_at: batch.time });
    return v;
  };
  const randomDenom = (fuel) => R.weighted(DENOMS[fuel]);

  // ── Paz feedback imports: weekly; redeemed_at = the import that reported the card ──
  const pazImports = [];
  for (let d = 2; d <= 152; d += 7) pazImports.push({ daysAgo: d, time: at(d, 14, R.int(0, 59)), cards: [] });
  /** First Paz import at or after the moment the card was actually used (null: not reported yet). */
  const reportOf = (usedAt) => {
    const hits = pazImports.filter((p) => p.time >= usedAt);
    return hits.length ? hits.reduce((a, b) => (a.time < b.time ? a : b)) : null;
  };
  const redeem = (v, usedAt) => {
    const imp = reportOf(usedAt);
    if (!imp) return;
    Object.assign(v, { status: STATUS.REDEEMED, redeemed_at: imp.time, updated_on: day(imp.time) });
    imp.cards.push(v.serial);
  };

  const routeFields = (route, branchName, allowInactive) => {
    if (route === "b2b") {
      const own = b2b.filter((c) => c.branch === branchName && (allowInactive || c.is_active));
      const active = b2b.filter((x) => x.is_active);
      const c = R.pick(own.length ? own : active.length ? active : b2b);
      return { route, client: c.client_name, client_code: c.client_code, account_name: c.account_name, standard: c.standard,
        client_id: null, site_id: null, site_name: null };
    }
    const usable = regular.filter((x) => allowInactive || x.is_active);
    const c = R.pick(usable.length ? usable : regular);
    return { route, client: c.client_name, client_id: c.client_id, site_id: c.site_id, site_name: c.site_name,
      client_code: null, account_name: null, standard: null };
  };
  const linkItems = (route) => {
    const n = R.weighted([[1, 35], [2, 35], [3, 20], [4, 10]]);
    const mainFuel = route === "b2b" ? R.weighted([["סולר", 60], ["בנזין", 40]]) : R.weighted([["בנזין", 75], ["סולר", 25]]);
    return Array.from({ length: n }, () => {
      const fuel = R.chance(0.85) ? mainFuel : (mainFuel === "בנזין" ? "סולר" : "בנזין");
      return { fuel, amount: randomDenom(fuel) };
    });
  };
  const issuerOf = (branchName) => {
    const sups = supervisorsOf(branchName);
    const mgr = managerOf(branchName);
    if (sups.length && (R.chance(0.8) || !mgr)) return R.pick(sups);
    return mgr ?? ownerActor;
  };
  const issuedFields = (issuer, branchName, worker, route, issuedAt, signed) => ({
    branch: branchName, supervisor: issuer.role === "supervisor" ? issuer.name : null, supervisor_id: issuer.id,
    status: STATUS.ISSUED, ...routeFields(route, branchName, false), reason: null, issue_reason: null,
    worker_name: worker.name, employee_name: worker.name,
    employee_phone: worker.phone,
    requester: (managerOf(branchName) ?? ownerActor).name, approver: ownerName,
    delivered_at: day(issuedAt), updated_on: day(issuedAt), issued_at: issuedAt, expires_at: addMonths(issuedAt, 3),
  });

  // ── 1. historical (pre-link) issuances, all redeemed: ~3–5 months ago ──
  for (let e = 0; e < 100; e += 1) {
    const b = ACT[e % ACT.length];
    const dAgo = R.int(95, 150);
    const issuedAt = at(dAgo, R.int(7, 17), R.int(0, 59));
    const worker = R.pick(workersOf(b));
    const issuer = issuerOf(b);
    const route = R.chance(0.5) ? "b2b" : "regular";
    // Older issuances may point at vehicles deactivated since (reports show them as inactive).
    const fields = { ...issuedFields(issuer, b, worker, route, issuedAt, true), ...routeFields(route, b, R.chance(0.12)) };
    const reason = R.pick(reasonsFor(route));
    for (const it of linkItems(route)) {
      const v = card(it.fuel, it.amount, batchBefore(dAgo), { ...fields, reason, issue_reason: reason });
      redeem(v, later(issuedAt, 1, 35));
    }
  }

  // ── 2. worker links: last ~3 months ──
  const linkDays = [0, 1, 2, 3, ...Array.from({ length: 41 }, () => R.int(4, 86))].sort((a, b) => a - b);
  const waitingIdx = new Set([0, 1, 3, 4, 6, 8, 9, 11, 13]);
  const usedLinkIds = new Set(ref.linkIds.map(String)); // never reuse a real link number
  const links = [];
  const archives = [];
  linkDays.forEach((dAgo, i) => {
    const b = ACT[(i * 3 + R.int(0, 3)) % ACT.length];
    const createdAt = at(dAgo, R.int(7, 18), R.int(0, 59));
    const worker = R.pick(workersOf(b));
    const issuer = issuerOf(b);
    const route = R.chance(0.5) ? "b2b" : "regular";
    const status = waitingIdx.has(i) ? "טרם נחתם" : "נחתם";
    const signed = status === "נחתם";
    let id;
    do id = String(R.int(10000000, 99999999)); while (usedLinkIds.has(id));
    usedLinkIds.add(id);
    const reason = R.pick(reasonsFor(route));
    const fields = { ...issuedFields(issuer, b, worker, route, createdAt, signed), reason, issue_reason: reason, link_id: id };
    const cards = linkItems(route).map((it) => card(it.fuel, it.amount, batchBefore(dAgo), { ...fields }));
    const signedAt = signed ? later(createdAt, 0, Math.min(2, dAgo)) : null;
    if (signed && status === "נחתם") {
      // Used cards show up in the next Paz feedback import (if one ran since).
      const pUse = Math.min(0.75, dAgo / 70);
      for (const v of cards) if (R.chance(pUse)) redeem(v, later(signedAt, 1, Math.max(1, dAgo - 1)));
    }
    const total = cards.reduce((t, v) => t + v.amount, 0);
    const link = {
      id, total, serials: cards.map((v) => v.serial), created_on: day(createdAt), created_at: createdAt,
      employee_name: worker.name, branch: b, supervisor_id: issuer.id,
      phone: worker.phone, signed_at: signedAt ? day(signedAt) : null,
      ...otpFields(id, DEMO_OTP),
    };
    if (signed) {
      archives.push({
        id: R.uuid(), link_id: id, branch: b, supervisor_id: issuer.id, employee_name: worker.name,
        employee_phone: worker.phone, total_amount: total,
        voucher_record_ids: link.serials, signature_image_url: signatureSvg(R), created_at: signedAt,
      });
    }
    links.push({ ...link, _status: status, _issuer: issuer, _worker: worker });
  });

  // ── 3. branch allocations (approved requests) and supervisor allocations: last 3 weeks ──
  const allocations = []; // { branch, fuel, amount, time, kind: 'branch'|'supervisor', sup }
  const requests = [];
  const requestId = (t) => `req-${t.getTime()}-${R.int(100, 998)}`;
  const BRANCH_STOCK = [["בנזין", 50, 6], ["בנזין", 100, 4], ["בנזין", 500, 1], ["סולר", 100, 8], ["סולר", 500, 2]];
  const SUP_STOCK = [["בנזין", 50, 2], ["בנזין", 100, 2], ["סולר", 100, 3], ["סולר", 500, 1]];
  ACT.forEach((b, bi) => {
    const manager = managerOf(b) ?? ownerActor;
    const allocDay = [17, 14, 12, 19, 16, 13][bi % 6];
    const allocAt = at(allocDay, 11, R.int(0, 59));
    const sum = { "בנזין": 0, "סולר": 0 };
    const requester = requesterOf(b, bi === 1);
    const base = { branch: b, requester: requester.name, approver: ownerName, updated_on: day(allocAt) };
    for (const [fuel, amount, n] of BRANCH_STOCK) {
      for (let k = 0; k < n; k += 1) { card(fuel, amount, recentBatch(), { ...base }); sum[fuel] += amount; }
    }
    for (const sup of supervisorsOf(b).slice(0, 3)) {
      const supAt = at(allocDay - R.int(1, 4), R.int(9, 16), R.int(0, 59));
      const supSum = { "בנזין": 0, "סולר": 0 };
      for (const [fuel, amount, n] of SUP_STOCK) {
        for (let k = 0; k < n; k += 1) {
          card(fuel, amount, recentBatch(), { ...base, supervisor: sup.name, supervisor_id: sup.id, updated_on: day(supAt) });
          sum[fuel] += amount; supSum[fuel] += amount;
        }
      }
      for (const fuel of ["בנזין", "סולר"]) {
        allocations.push({ kind: "supervisor", branch: b, fuel, amount: supSum[fuel], time: supAt, actor: manager, sup });
      }
    }
    for (const fuel of ["בנזין", "סולר"]) allocations.push({ kind: "branch", branch: b, fuel, amount: sum[fuel], time: allocAt, actor: ownerActor });
    // The request this allocation approved; two branches got less than they asked for.
    const askedExtra = bi % 2 === 0 ? 500 : 0;
    const createdAt = at(allocDay + R.int(1, 3), R.int(8, 15), R.int(0, 59));
    requests.push({
      id: requestId(createdAt), requester: requester.name, requester_id: requester.id, branch: b,
      amount: sum["בנזין"] + sum["סולר"] + askedExtra, benzine_amount: sum["בנזין"] + askedExtra, diesel_amount: sum["סולר"],
      reason: ["תגבור משמרות לקראת סוף הרבעון", "הצבת צוותי אבטחה באתרים חדשים", "חידוש מלאי חודשי לסניף", "סיורי לילה מוגברים"][bi % 4],
      created_on: day(createdAt), created_at: createdAt, status: "אושר", approved_amount: sum["בנזין"] + sum["סולר"],
      approver: ownerName, _approvedAt: allocAt, _requester: requester,
    });
  });
  // Older history: one approved and three rejected requests.
  const OLD = [
    [2400, 1800, 600, "אושר", 2000, 64, "אירוע לקוח באתר תעשייה"],
    [5000, 3000, 2000, "נדחה", null, 41, "בקשה לרבעון מלא מראש"],
    [1500, 1000, 500, "נדחה", null, 30, "כפילות לדרישה קודמת"],
    [900, 500, 400, "נדחה", null, 6, "מלאי מפקחים טרם נוצל"],
  ];
  OLD.forEach(([amount, benz, dies, status, approved, dAgo, reason], k) => {
    const b = ACT[k % ACT.length];
    const createdAt = at(dAgo, R.int(8, 15), R.int(0, 59));
    const requester = requesterOf(b, false);
    requests.push({
      id: requestId(createdAt), requester: requester.name, requester_id: requester.id, branch: b, amount,
      benzine_amount: benz, diesel_amount: dies, reason, created_on: day(createdAt), created_at: createdAt, status,
      approved_amount: approved, approver: ownerName, _approvedAt: later(createdAt, 0, 1), _requester: requester,
    });
  });
  // Pending (ממתין לאישור): exactly four, recent.
  const PENDING = [
    [false, 1500, 500, 1, "תגבור משמרות לילה"],
    [true, 1200, 0, 2, "אירוע אבטחה אצל לקוח — צוות מורחב"],
    [false, 2000, 1000, 3, "פתיחת אתר חדש"],
    [true, 300, 500, 0, "סיורי לילה מוגברים"],
  ];
  PENDING.forEach(([bySupervisor, benz, dies, dAgo, reason], k) => {
    const b = ACT[k % ACT.length];
    const createdAt = at(dAgo, R.int(7, 12), R.int(0, 59));
    const requester = requesterOf(b, bySupervisor);
    requests.push({
      id: requestId(createdAt), requester: requester.name, requester_id: requester.id, branch: b,
      amount: benz + dies, benzine_amount: benz, diesel_amount: dies, reason, created_on: day(createdAt), created_at: createdAt,
      status: "ממתין לאישור", approved_amount: null, approver: null, _requester: requester,
      sizes: { "בנזין": asCards(benz, [500, 100, 50]), "סולר": asCards(dies, [500, 100]) },
    });
  });

  // ── 4. healthy central pool (מאגר ראשי) ──
  const CENTRAL = [["בנזין", 50, 60], ["בנזין", 100, 48], ["בנזין", 500, 18], ["סולר", 100, 100], ["סולר", 500, 30]];
  let forcedZeros = 12;
  for (const [fuel, amount, n] of CENTRAL) {
    for (let k = 0; k < n; k += 1) {
      const batch = forcedZeros > 0 && k % 7 === 3 ? (forcedZeros -= 1, BATCHES[5])
        : recentBatch();
      card(fuel, amount, batch);
    }
  }
  const centralBalance = vouchers.filter((v) => v.branch === MAIN_POOL && v.status === STATUS.AVAILABLE)
    .reduce((t, v) => t + v.amount, 0);

  // Cards that passed 3 months without being issued.
  for (let k = 0; k < 14; k += 1) {
    card(k % 3 ? "בנזין" : "סולר", 100, BATCHES[k % 2], { status: STATUS.BLOCKED, blocked_at: at(5, 3, 0), updated_on: day(at(5, 3, 0)) });
  }

  // ── 5. activity log: every event of the last 3 weeks ──
  const log = [];
  const entry = (actor, action, target, time, details = null) => {
    if (daysAgoOf(time) > LOG_WINDOW) return;
    log.push({ id: null, user_id: actor.id, user_name: actor.name, role: roleLabel(actor.role), action, target: target || "-",
      ip_address: `198.51.100.${R.int(2, 250)}`, details, created_at: time }); // reserved documentation range: never a real address
  };
  for (const b of BATCHES) {
    entry(ownerActor, "ייבוא מלאי שוברים", `${b.n} נוספו, 0 כפולים דולגו`, b.time, { added: b.n, skipped: 0 });
  }
  for (const p of pazImports) {
    const nums = [...p.cards].sort();
    entry(ownerActor, "היזון חוזר מימושים מפז",
      `${nums.length} שוברים עודכנו למומש סופית · מספרי כרטיסים: ${nums.length ? nums.join(", ") : "ללא"}`,
      p.time, { count: nums.length, card_numbers: nums });
  }
  const activeB2b = b2b.filter((c) => c.is_active).length;
  const activeReg = regular.filter((c) => c.is_active).length;
  entry(ownerActor, "סנכרון מאגר רכב עבודה",
    `0 הוחזרו לפעיל, ${activeB2b} נותרו פעילים, 0 חדשים, ${b2b.length - activeB2b} לא פעילים, 0 שורות ריקות/לא תקינות דולגו, 0 כפולים דולגו`,
    at(20, 9, 40), { added: 0, updated: activeB2b, active: activeB2b, reactivated: 0, remained_active: activeB2b,
      deactivated: b2b.length - activeB2b, duplicates: 0, blanks: 0, invalid: 0, skipped: 0 });
  entry(ownerActor, "סנכרון מאגר רכב פרטי",
    `0 חדשים, ${activeReg} עודכנו, ${regular.length - activeReg} לא פעילים, 0 כפולים דולגו`,
    at(20, 9, 52), { added: 0, updated: activeReg, deactivated: regular.length - activeReg, duplicates: 0, blanks: 0,
      reactivated: 0, remained_active: activeReg });
  for (const r of requests) {
    entry(r._requester, "הגשת דרישת שוברים", `${r.branch} · ${r.amount} ₪`, r.created_at);
    if (r.status === "אושר") entry(ownerActor, "אישור דרישה", `${r.requester} · ${r.approved_amount} ₪`, r._approvedAt);
    if (r.status === "נדחה") entry(ownerActor, "דחיית דרישה", r.requester, r._approvedAt);
  }
  for (const a of allocations) {
    if (!a.amount) continue;
    if (a.kind === "branch") entry(a.actor, "הקצאת שוברים", `${a.branch} · ${a.fuel} · ${a.amount} ₪`, a.time);
    else entry(a.actor, "הקצאה למפקח", `${a.sup.name} · ${a.fuel} · ${a.amount} ₪`, a.time);
  }
  for (const l of links) entry(l._issuer, "הנפקת שובר לעובד", `קישור ${l.id} · ${l.total} ₪`, new Date(l.created_at.getTime() + 60000));
  // Only people who really have an account "sign in" (real mode: users with a real login profile).
  const canLogin = (s) => !realStaff.length || s.hasProfile;
  const loginPool = [{ ...ownerActor, phone: owner?.phone }, ...staff.filter((s) => s.role !== "viewer" && canLogin(s)).slice(0, 30),
    staff.find((s) => s.role === "viewer" && canLogin(s))].filter(Boolean);
  for (let k = 0; k < 14; k += 1) {
    const u = k < 3 ? loginPool[0] : R.pick(loginPool);
    entry(u, "כניסה למערכת", u.phone, at(k < 3 ? k * 6 : R.int(0, LOG_WINDOW), R.int(7, 9), R.int(0, 59)));
  }
  for (const e of log) e.id = R.uuid();

  // ── write ──
  const strip = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_"))));
  // Staff that appear as actors in the demo but have no login yet get a demo-only profile (unusable hash).
  const actorIds = new Set([...vouchers.map((v) => v.supervisor_id), ...links.map((l) => l.supervisor_id)].filter(Boolean));
  for (const st of staff) {
    if (st.hasProfile || (realStaff.length && !actorIds.has(st.id)) || profiles.some((p) => p.id === st.id || (st.phone && p.phone === st.phone))) continue;
    profiles.push({ id: st.id, phone: st.phone, email: st.email, full_name: st.name, branch: st.branch, role: st.role,
      password_hash: DUMMY_HASH, requires_password_change: false, last_login_at: at(R.int(0, 6), R.int(7, 17), R.int(0, 59)) });
  }

  await Profile.insertMany(profiles);
  await AppUser.insertMany(appUsers);
  await Branch.insertMany(branches);
  await IssueReason.insertMany(reasons);
  await B2BClient.insertMany(b2b);
  await RegularClient.insertMany(regular);
  await Voucher.insertMany(vouchers);
  await VoucherCode.insertMany(codes);
  await VoucherRequest.insertMany(strip(requests));
  await WorkerLink.insertMany(strip(links));
  await SignatureArchive.insertMany(archives);
  await ActivityLog.insertMany(log);
  await AppSetting.updateOne({ key: "main" }, { $set: { balance: centralBalance } }, { upsert: true });

  // Easy demo links: newest of each employee-page state.
  const demo = (status) => links.find((l) => l._status === status);
  const demoLinks = ["נחתם", "טרם נחתם"].map(demo).filter(Boolean).map((l) => ({
    id: l.id, otp: DEMO_OTP, phone: l._worker.phone, status: l._status,
    employeeName: l.employee_name, total: l.total, cards: l.serials.length,
  }));

  const entries = await Promise.all(Object.entries({
    profiles: Profile, app_users: AppUser, app_settings: AppSetting, branches: Branch, issue_reasons: IssueReason,
    b2b_clients: B2BClient, regular_clients: RegularClient, vouchers: Voucher, voucher_codes: VoucherCode,
    voucher_requests: VoucherRequest, worker_links: WorkerLink, signatures_archive: SignatureArchive, activity_log: ActivityLog,
  }).map(async ([k, m]) => [k, await m.countDocuments()]));
  return { counts: Object.fromEntries(entries), centralBalance, demoLinks };
}

/** Bumped whenever the dataset's shape changes; an older learning copy is re-seeded on next activation. */
export const SEED_VERSION = 7;

/** Drops Mongo internals so a real document can be copied into its learning twin. */
function stripDoc(doc) {
  const { _id, __v, ...rest } = doc;
  return rest;
}

/**
 * Real reference data (branches, users, issue reasons, vehicle pools), read with the REAL models
 * explicitly, so the copy is taken from the live system even though the seed runs in learning context.
 * Read-only: nothing here is ever written to the real collections.
 */
async function loadReference() {
  const [branches, users, profiles, reasons, b2b, regular, linkIds] = await Promise.all([
    REAL.Branch.find().lean(), REAL.AppUser.find().lean(), REAL.Profile.find().lean(),
    REAL.IssueReason.find().lean(), REAL.B2BClient.find().lean(), REAL.RegularClient.find().lean(),
    REAL.WorkerLink.distinct("id"),
  ]);
  return { branches, users, profiles, reasons, b2b, regular, linkIds };
}

/** Fictional staff for a system without a users directory: the fixed table, or 1 manager + 2 supervisors per branch. */
function fictionalStaff(R, branchNames) {
  const known = new Set(BRANCHES.map((b) => b.name));
  if (branchNames.every((n) => known.has(n))) {
    return STAFF.filter(([, , , branch]) => !branch || branchNames.includes(branch))
      .map(([last, first, role, branch, title, canRequest]) => ({ last, first, name: `${last} ${first}`, role, branch, title, canRequest }));
  }
  const used = new Set();
  const person = () => {
    for (;;) {
      const last = R.pick(LAST);
      const first = R.pick(FIRST_M);
      if (!used.has(last + first)) { used.add(last + first); return { last, first, name: `${last} ${first}` }; }
    }
  };
  const out = [];
  branchNames.slice(0, 6).forEach((branch, i) => {
    out.push({ ...person(), role: "branch", branch, title: "מנהל סניף", canRequest: true });
    out.push({ ...person(), role: "supervisor", branch, title: "מפקח", canRequest: i % 2 === 0 });
    out.push({ ...person(), role: "supervisor", branch, title: "מפקח", canRequest: false });
  });
  out.push({ ...person(), role: "viewer", branch: "", title: "צופה", canRequest: false });
  return out;
}

const GENERIC_B2B = [["מרכז לוגיסטי", 3], ["פארק תעשייה", 2], ["קריית משרדים", 2]];

/** Small inline SVG of a handwritten-looking signature stroke. */
function signatureSvg(R) {
  let x = 18 + R.int(0, 10);
  let y = 62 + R.int(-6, 6);
  let d = `M${x} ${y}`;
  const strokes = R.int(5, 8);
  for (let i = 0; i < strokes; i += 1) {
    const nx = x + R.int(22, 38);
    const ny = 60 + R.int(-22, 18);
    d += ` C${x + R.int(4, 14)} ${y - R.int(20, 45)} ${nx - R.int(4, 14)} ${ny + R.int(20, 40)} ${nx} ${ny}`;
    x = nx; y = ny;
  }
  const flourish = `M${20 + R.int(0, 20)} ${82 + R.int(-3, 3)} Q${x / 2} ${92 + R.int(0, 6)} ${x + R.int(5, 20)} ${76 + R.int(-4, 4)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="110" viewBox="0 0 320 110">`
    + `<path d="${d}" fill="none" stroke="#1e3a8a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${flourish}" fill="none" stroke="#1e3a8a" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
