/**
 * Mongoose models — one collection per former Postgres table, same column names,
 * so business rules and the frontend mappers (src/lib/cloudSync.ts) keep working.
 * `_id` is internal; rows that had a uuid primary key keep a string `id`.
 */
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { pazMatchKey } from "./lib/canonical.js";
import { learningContext } from "./lib/learningContext.js";
import { forgetAllLinks, forgetLink } from "./lib/linkStatusCache.js";
import { currentIp } from "./lib/requestContext.js";

const { Schema } = mongoose;
const uuid = { type: String, default: () => randomUUID() };
const str = (def) => (def === undefined ? { type: String, default: null } : { type: String, default: def });
const opts = (collection) => ({
  collection,
  versionKey: false,
  minimize: false,
  timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
});

export const ROLES = ["admin", "branch", "supervisor", "viewer"];
const role = { type: String, enum: ROLES, default: "supervisor" };

/** Login accounts (replaces Supabase auth.users + profiles + user_roles). */
const profileSchema = new Schema({
  id: uuid,
  email: { type: String, lowercase: true, trim: true, default: null },
  phone: str(""),
  full_name: str(""),
  branch: str(""),
  role,
  /** Empty for accounts that only sign in with Microsoft. */
  password_hash: str(""),
  /** The provider identity this account is pinned to at first sign-in with that provider. */
  microsoft_sub: str(),
  google_sub: str(),
  requires_password_change: { type: Boolean, default: true },
  token_version: { type: Number, default: 0 },
  failed_logins: { type: Number, default: 0 },
  locked_until: { type: Date, default: null },
  last_login_at: { type: Date, default: null },
  /** Owner-only learning environment (סביבת לימוד) switch. */
  learning_mode: { type: Boolean, default: false },
}, opts("profiles"));
profileSchema.index({ id: 1 }, { unique: true });
profileSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
profileSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string", $gt: "" } } });
profileSchema.virtual("is_first_login").get(function () { return this.requires_password_change; });

/** Staff directory managed in Settings → Users. */
const appUserSchema = new Schema({
  id: uuid,
  email: { type: String, lowercase: true, trim: true, default: null },
  last_name: str(""), first_name: str(""), role,
  title: str(""), phone: str(""), branch: str(""),
  can_request: { type: Boolean, default: false },
  requires_password_change: { type: Boolean, default: true },
}, opts("app_users"));
appUserSchema.index({ id: 1 }, { unique: true });
appUserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });

const appSettingSchema = new Schema({
  key: { type: String, required: true },
  balance: { type: Number, default: 0 },
}, opts("app_settings"));
appSettingSchema.index({ key: 1 }, { unique: true });

const branchSchema = new Schema({
  id: { type: String, required: true }, name: { type: String, required: true },
  manager: str(""), city: str(""),
}, opts("branches"));
branchSchema.index({ id: 1 }, { unique: true });

const reasonSchema = new Schema({
  id: uuid, name: { type: String, required: true }, category: str("Regular"),
}, opts("issue_reasons"));
reasonSchema.index({ id: 1 }, { unique: true });

/** מאגר רכב עבודה (work vehicles). Identity = standard + client_code. */
const b2bSchema = new Schema({
  id: uuid,
  client_code: { type: String, required: true },
  account_name: str(""), client_name: str(""), branch: str(""), standard: str(""),
  balance: str(), load_type: str(), budget_section: str(), account_key: str(),
  item_family: str(), account_status: str(), account_type: str(),
  is_active: { type: Boolean, default: true },
}, opts("b2b_clients"));
b2bSchema.index({ id: 1 }, { unique: true });
b2bSchema.index({ standard: 1, client_code: 1 });
b2bSchema.index({ is_active: 1 });
b2bSchema.index({ created_at: 1 });

/** מאגר רכב פרטי (private vehicles). Identity = client_id + site_id. */
const regularSchema = new Schema({
  id: uuid,
  client_id: { type: String, required: true }, client_name: str(""),
  site_id: { type: String, required: true }, site_name: str(""),
  standard: str(),
  is_active: { type: Boolean, default: true },
}, opts("regular_clients"));
regularSchema.index({ id: 1 }, { unique: true });
regularSchema.index({ client_id: 1, site_id: 1 }, { unique: true });
regularSchema.index({ is_active: 1 });
regularSchema.index({ created_at: 1 });

/** Physical fuel cards. Redemption codes live separately in voucher_codes. */
const voucherSchema = new Schema({
  serial: { type: String, required: true },
  real_code: str(""),
  amount: { type: Number, default: 100 },
  fuel_type: str("בנזין"),
  branch: str("מאגר ראשי"),
  supervisor: str(), client: str(),
  status: str("טרם שומש"),
  updated_on: { type: String, default: () => new Date().toISOString().slice(0, 10) },
  requester: str(), approver: str(), client_id: str(), site_id: str(), site_name: str(),
  reason: str(), worker_name: str(), delivered_at: str(), route: str(),
  link_id: str(), client_code: str(), account_name: str(), standard: str(), license_plate: str(),
  driver_name: str(), standard_name: str(), employee_name: str(),
  employee_phone: str(), issue_reason: str(),
  issued_at: { type: Date, default: null }, expires_at: { type: Date, default: null },
  /** Set when the card expired unissued, 3 months after entering stock (lib/expireStock.js). */
  blocked_at: { type: Date, default: null },
  redeemed_at: { type: Date, default: null },
  supervisor_id: str(), card_number: str(), paz_match_key: str(),
  failed_attempts: { type: Number, default: 0 }, is_locked: { type: Boolean, default: false },
}, opts("vouchers"));
voucherSchema.index({ serial: 1 }, { unique: true });
voucherSchema.index({ branch: 1, status: 1 });
voucherSchema.index({ fuel_type: 1, amount: 1, status: 1, branch: 1 });
voucherSchema.index({ supervisor_id: 1 });
voucherSchema.index({ paz_match_key: 1 });
voucherSchema.index({ link_id: 1 });
voucherSchema.index({ status: 1, created_at: 1 });
// The staff app reads whole tables in created_at order.
voucherSchema.index({ created_at: 1 });
/**
 * paz_match_key mirrors the SQL expression index paz_card_match_key(card_number), where
 * card_number was GENERATED ALWAYS AS (serial). Here card_number may be unset on rows
 * written through the table API, so the effective card number is card_number ?? serial.
 */
const voucherMatchKey = (d) => pazMatchKey(d.card_number ?? d.serial ?? null);
voucherSchema.pre("save", function () { this.paz_match_key = voucherMatchKey(this); });
voucherSchema.pre("insertMany", function (next, docs) {
  for (const d of Array.isArray(docs) ? docs : [docs]) if (d) d.paz_match_key = voucherMatchKey(d);
  next();
});
voucherSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], { document: false, query: true }, function () {
  const u = this.getUpdate();
  if (!u || Array.isArray(u)) return;
  const set = u.$set ?? u;
  if ("serial" in set || "card_number" in set) {
    const key = voucherMatchKey(set);
    if (u.$set) u.$set.paz_match_key = key; else u.paz_match_key = key;
    this.setUpdate(u);
  }
});

const voucherCodeSchema = new Schema({
  serial: { type: String, required: true },
  real_code: str(""), redemption_code: str(), card_number: str(),
}, opts("voucher_codes"));
voucherCodeSchema.index({ serial: 1 }, { unique: true });
voucherCodeSchema.index({ card_number: 1 }, { unique: true, partialFilterExpression: { card_number: { $type: "string" } } });
voucherCodeSchema.pre("save", function () {
  if (!this.redemption_code) this.redemption_code = this.real_code;
});

const requestSchema = new Schema({
  id: { type: String, required: true },
  requester: str(""), requester_id: str(""), branch: str(""),
  amount: { type: Number, default: 0 }, reason: str(""), created_on: str(""),
  status: str("ממתין לאישור"),
  approved_amount: { type: Number, default: null }, approver: str(),
  benzine_amount: { type: Number, default: null }, diesel_amount: { type: Number, default: null },
  /** Cards asked for: { בנזין: { 100: 3 }, סולר: { 500: 1 } }. Null on older requests. */
  sizes: { type: Schema.Types.Mixed, default: null },
}, opts("voucher_requests"));
requestSchema.index({ id: 1 }, { unique: true });
requestSchema.index({ created_at: 1 });
requestSchema.index({ branch: 1 });

const workerLinkSchema = new Schema({
  id: { type: String, required: true },
  total: { type: Number, default: 0 },
  serials: { type: [String], default: [] },
  created_on: str(""), phone: str(), signed_at: str(),
  employee_name: str(), branch: str(), supervisor_id: str(),
  /** One-time SMS code, stored only as a hash (lib/workerOtp.js). */
  otp_hash: str(), otp_expires_at: { type: Date, default: null },
  otp_attempts: { type: Number, default: 0 }, otp_sent_at: { type: Date, default: null },
  /** Cards whose code the employee chose to reveal; every other code stays hidden in the wallet. */
  revealed_serials: { type: [String], default: [] },
}, opts("worker_links"));
workerLinkSchema.index({ id: 1 }, { unique: true });
workerLinkSchema.index({ branch: 1 });
workerLinkSchema.index({ created_at: 1 });
// Every write to a link drops its cached public status, before and after the write.
const LINK_WRITES = ["updateOne", "updateMany", "findOneAndUpdate", "findOneAndDelete", "deleteOne", "deleteMany", "replaceOne"];
function dropCachedStatus() {
  const id = this.getFilter?.()?.id;
  if (typeof id === "string") forgetLink(id); else forgetAllLinks();
}
workerLinkSchema.pre(LINK_WRITES, { document: false, query: true }, dropCachedStatus);
workerLinkSchema.post(LINK_WRITES, { document: false, query: true }, dropCachedStatus);
workerLinkSchema.post("save", function () { forgetLink(this.id); });

const signatureSchema = new Schema({
  id: uuid, link_id: str(), branch: str(), supervisor_id: str(), employee_name: str(),
  employee_phone: str(), total_amount: { type: Number, default: 0 },
  voucher_record_ids: { type: [String], default: [] }, signature_image_url: str(),
}, opts("signatures_archive"));
signatureSchema.index({ id: 1 }, { unique: true });

const activitySchema = new Schema({
  id: uuid, user_id: str(), user_name: str(""), role: str(""), action: { type: String, required: true },
  target: str("-"),
  /** Stamped by the server from the request; never taken from the browser (see routes/table.js). */
  ip_address: { type: String, default: currentIp },
  /** Structured audit payload for imports/reconciliation (counts, card numbers). */
  details: { type: Schema.Types.Mixed, default: null },
}, opts("activity_log"));
activitySchema.index({ created_at: -1 });

/**
 * Internal mutex documents (not exposed through TABLES): writing one inside a transaction
 * serialises every transaction that touches it, like SQL LOCK TABLE ... SHARE ROW EXCLUSIVE.
 */
const inventoryLockSchema = new Schema({ _id: String, n: { type: Number, default: 0 } },
  { collection: "inventory_locks", versionKey: false });
export const InventoryLock = mongoose.model("InventoryLock", inventoryLockSchema);

/**
 * Learning environment (סביבת לימוד): every model has a twin bound to a `learning_<collection>`
 * collection. The exported models are proxies that resolve, per request, to the real or the
 * learning model via AsyncLocalStorage (see server/lib/learning.js). Nothing outside a learning
 * context can ever read or write the learning collections, and vice versa.
 */
function twin(name, schema) {
  const real = mongoose.model(name, schema);
  const learning = mongoose.model(`Learning${name}`, schema, `learning_${schema.options.collection}`);
  REAL[name] = real;
  LEARNING[name] = learning;
  const pick = () => (learningContext.getStore()?.learning ? learning : real);
  // Dummy function target: avoids Proxy invariants on the real model's non-configurable props.
  return new Proxy(function routedModel() {}, {
    get(_t, prop) {
      const m = pick();
      const v = Reflect.get(m, prop, m);
      return typeof v === "function" && prop !== "prototype" ? v.bind(m) : v;
    },
    construct(_t, args) { return new (pick())(...args); },
    apply(_t, self, args) { return Reflect.apply(pick(), self, args); },
    has(_t, prop) { return prop in pick(); },
  });
}
export const REAL = {};
export const LEARNING = {};

export const Profile = twin("Profile", profileSchema);
export const AppUser = twin("AppUser", appUserSchema);
export const AppSetting = twin("AppSetting", appSettingSchema);
export const Branch = twin("Branch", branchSchema);
export const IssueReason = twin("IssueReason", reasonSchema);
export const B2BClient = twin("B2BClient", b2bSchema);
export const RegularClient = twin("RegularClient", regularSchema);
export const Voucher = twin("Voucher", voucherSchema);
export const VoucherCode = twin("VoucherCode", voucherCodeSchema);
export const VoucherRequest = twin("VoucherRequest", requestSchema);
export const WorkerLink = twin("WorkerLink", workerLinkSchema);
export const SignatureArchive = twin("SignatureArchive", signatureSchema);
export const ActivityLog = twin("ActivityLog", activitySchema);

/** Table name (as used by the frontend) → model. */
export const TABLES = {
  profiles: Profile,
  app_users: AppUser,
  app_settings: AppSetting,
  branches: Branch,
  issue_reasons: IssueReason,
  b2b_clients: B2BClient,
  regular_clients: RegularClient,
  vouchers: Voucher,
  voucher_codes: VoucherCode,
  voucher_requests: VoucherRequest,
  worker_links: WorkerLink,
  signatures_archive: SignatureArchive,
  activity_log: ActivityLog,
};
