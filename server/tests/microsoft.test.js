/** Sign in with Microsoft, email login, the startup migration, and the owner check by email. */
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { startTestServer, stopTestServer, resetDb, loginAs, anon } from "./helpers.js";
import { AppUser, Profile, Voucher } from "../models.js";
import { isDevToolsOwner } from "../auth.js";
import { transport } from "../lib/microsoftAuth.js";
import { migrateUserIdentity } from "../lib/migrateUsers.js";

const CONSUMERS = "9188040d-6c67-4c5b-b112-36a304b66dad";
const ORG = "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb";
const CLIENT = "client-id-for-tests";
let key;
const real = { keys: transport.keys, exchangeCode: transport.exchangeCode };

before(async () => {
  await startTestServer();
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  transport.keys = createLocalJWKSet({ keys: [jwk] });
});
after(async () => {
  Object.assign(transport, real);
  await stopTestServer();
});
beforeEach(async () => {
  await resetDb();
  Object.assign(process.env, { MICROSOFT_CLIENT_ID: CLIENT, MICROSOFT_CLIENT_SECRET: "s" });
  delete process.env.MICROSOFT_TENANT_ID;
});
afterEach(() => { delete process.env.MICROSOFT_CLIENT_ID; delete process.env.MICROSOFT_CLIENT_SECRET; });

const token = (claims, nonce, { tid = CONSUMERS, aud = CLIENT, iss, signWith = key } = {}) =>
  new SignJWT({ nonce, tid, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(iss ?? `https://login.microsoftonline.com/${tid}/v2.0`)
    .setAudience(aud).setSubject("sub-1").setIssuedAt().setExpirationTime("5m").sign(signWith);

/** Walks the whole redirect flow with a fake Microsoft, returning the final redirect. */
async function signInWithMicrosoft(claims, opts = {}) {
  const agent = anon();
  const start = await agent.get("/api/auth/microsoft/start");
  assert.equal(start.status, 302);
  const url = new URL(start.headers.location);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const nonce = opts.nonce ?? url.searchParams.get("nonce");
  transport.exchangeCode = async () => ({ id_token: await token(claims, nonce, opts) });
  const state = opts.state ?? url.searchParams.get("state");
  const cb = await agent.get("/api/auth/microsoft/callback").query({ code: "c", state });
  return { agent, location: cb.headers.location, status: cb.status };
}
const staff = (over = {}) => AppUser.create({ email: "dana@outlook.com", first_name: "דנה", last_name: "לוי", role: "supervisor", phone: "0521111111", branch: "חיפה", ...over });

describe("sign in with Microsoft", () => {
  it("a listed address gets a session; the first sign-in creates the login account", async () => {
    const u = await staff();
    const r = await signInWithMicrosoft({ email: "Dana@Outlook.com", oid: "o1" });
    assert.equal(r.location, "/");
    const me = await r.agent.get("/api/auth/me");
    assert.equal(me.body.profile.id, u.id);
    assert.equal(me.body.profile.email, "dana@outlook.com");
    assert.equal(me.body.profile.requires_password_change, false);
  });

  it("an unlisted address is refused with the Hebrew message's code", async () => {
    await staff();
    const r = await signInWithMicrosoft({ email: "stranger@outlook.com", oid: "o1" });
    assert.equal(r.location, "/login?error=not_authorized");
    assert.equal((await r.agent.get("/api/auth/me")).body.profile, null);
    assert.equal(await Profile.countDocuments({ email: "stranger@outlook.com" }), 0);
  });

  it("does not trust an address from another organisation's tenant", async () => {
    await staff();
    const r = await signInWithMicrosoft({ email: "dana@outlook.com", oid: "o1" }, { tid: ORG });
    assert.equal(r.location, "/login?error=not_authorized");
  });

  it("trusts its own configured tenant, or a domain-verified address", async () => {
    await staff();
    process.env.MICROSOFT_TENANT_ID = ORG;
    assert.equal((await signInWithMicrosoft({ email: "dana@outlook.com", oid: "o1" }, { tid: ORG })).location, "/");
    delete process.env.MICROSOFT_TENANT_ID;
    const other = "cccccccc-1111-4222-8333-dddddddddddd";
    await staff({ email: "ron@corp.example", phone: "0522222222" });
    assert.equal((await signInWithMicrosoft({ email: "ron@corp.example", oid: "o2", xms_edov: true }, { tid: other })).location, "/");
  });

  it("pins the account to its Microsoft identity", async () => {
    await staff();
    await signInWithMicrosoft({ email: "dana@outlook.com", oid: "o1" });
    const again = await signInWithMicrosoft({ email: "dana@outlook.com", oid: "someone-else" });
    assert.equal(again.location, "/login?error=not_authorized");
  });

  it("rejects a wrong state, nonce, audience, issuer or signature", async () => {
    await staff();
    const bad = { location: "/login?error=microsoft_failed" };
    const claims = { email: "dana@outlook.com", oid: "o1" };
    const other = (await generateKeyPair("RS256")).privateKey;
    for (const opts of [{ state: "forged" }, { nonce: "forged" }, { aud: "another-app" }, { iss: "https://evil.example/v2.0" }, { signWith: other }]) {
      assert.equal((await signInWithMicrosoft(claims, opts)).location, bad.location, JSON.stringify(Object.keys(opts)));
    }
    assert.equal(await Profile.countDocuments({ email: "dana@outlook.com" }), 0);
  });

  it("is refused without a started attempt, and stays off until configured", async () => {
    assert.equal((await anon().get("/api/auth/microsoft/callback").query({ code: "c", state: "s" })).headers.location, "/login?error=microsoft_failed");
    assert.equal((await anon().get("/api/auth/options")).body.microsoft, true);
    delete process.env.MICROSOFT_CLIENT_ID;
    assert.equal((await anon().get("/api/auth/options")).body.microsoft, false);
  });

  it("links cards held by name to a supervisor at first Microsoft sign-in", async () => {
    await staff();
    await Voucher.create({ serial: "H1", amount: 100, branch: "חיפה", supervisor: "לוי דנה" });
    await signInWithMicrosoft({ email: "dana@outlook.com", oid: "o1" });
    const p = await Profile.findOne({ email: "dana@outlook.com" }).lean();
    assert.equal((await Voucher.findOne({ serial: "H1" }).lean()).supervisor_id, p.id);
  });
});

describe("password login", () => {
  it("works with email and with phone; an account with no password cannot use it", async () => {
    const u = await loginAs("admin", { email: "Maya@Example.com" });
    for (const identifier of ["maya@example.com", "MAYA@example.com", u.phone]) {
      assert.equal((await anon().post("/api/auth/login").send({ identifier, password: u.password })).status, 200, identifier);
    }
    await staff();
    await signInWithMicrosoft({ email: "dana@outlook.com", oid: "o1" });
    assert.equal((await anon().post("/api/auth/login").send({ identifier: "dana@outlook.com", password: "" })).status, 400);
    assert.equal((await anon().post("/api/auth/login").send({ identifier: "dana@outlook.com", password: "Passw0rd!" })).status, 401);
  });
});

describe("owner check", () => {
  it("uses the owner email and fails closed", () => {
    const user = { role: "admin", requires_password_change: false, email: "maya@example.com" };
    delete process.env.DEV_TOOLS_OWNER_EMAIL;
    assert.equal(isDevToolsOwner(user), false);
    process.env.DEV_TOOLS_OWNER_EMAIL = " MAYA@example.com ";
    assert.equal(isDevToolsOwner(user), true);
    assert.equal(isDevToolsOwner({ ...user, email: "other@example.com" }), false);
    assert.equal(isDevToolsOwner({ ...user, role: "branch" }), false);
    delete process.env.DEV_TOOLS_OWNER_EMAIL;
  });
});

describe("startup migration", () => {
  it("gives old users a stable id, keeps their logins and is safe to repeat", async () => {
    const db = mongoose.connection.db;
    const users = db.collection("app_users");
    const profiles = db.collection("profiles");
    const requests = db.collection("voucher_requests");
    // Before the migration there is no id index yet.
    await users.dropIndex("id_1");
    await users.insertMany([
      { national_id: "111111118", first_name: "א", last_name: "ב", role: "admin", phone: "0501111111" },
      { national_id: "222222226", first_name: "ג", last_name: "ד", role: "supervisor", phone: "0502222222" },
    ]);
    await profiles.insertOne({ id: "profile-1", national_id: "111111118", phone: "0501111111", role: "admin", password_hash: "x" });
    await requests.insertOne({ id: "r1", requester_id: "111111118" });
    Object.assign(process.env, { DEV_TOOLS_OWNER_EMAIL: "owner@example.com", DEV_TOOLS_OWNER_NATIONAL_ID: "111111118" });

    await migrateUserIdentity(db);
    await migrateUserIdentity(db);

    const a = await users.findOne({ national_id: "111111118" });
    const b = await users.findOne({ national_id: "222222226" });
    assert.equal(a.id, "profile-1");
    assert.ok(b.id && b.id !== a.id);
    assert.equal(a.email, "owner@example.com");
    assert.equal((await profiles.findOne({ id: "profile-1" })).email, "owner@example.com");
    assert.equal((await requests.findOne({ id: "r1" })).requester_id, "profile-1");
    delete process.env.DEV_TOOLS_OWNER_EMAIL;
    delete process.env.DEV_TOOLS_OWNER_NATIONAL_ID;
    await AppUser.createIndexes();
  });

  it("drops the old unique indexes so users without a national id or phone can coexist", async () => {
    const col = mongoose.connection.db.collection("profiles");
    await col.dropIndex("phone_1");
    await col.createIndex({ phone: 1 }, { unique: true });
    await col.createIndex({ national_id: 1 }, { unique: true });
    await migrateUserIdentity(mongoose.connection.db);
    const names = (await col.indexes()).map((i) => i.name);
    assert.equal(names.includes("national_id_1"), false);
    assert.equal(names.includes("phone_1"), false);
    await Profile.createIndexes();
    await Profile.create([{ email: "a@example.com" }, { email: "b@example.com" }]);
    assert.equal(await Profile.countDocuments(), 2);
  });
});
