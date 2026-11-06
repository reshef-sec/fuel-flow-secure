/**
 * Shared integration-test harness: an in-memory MongoDB *replica set* (transactions
 * behave exactly like Atlas) + the real Express app driven through supertest.
 */
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../app.js";
import { connectDb } from "../db.js";
import { Profile, AppUser, TABLES } from "../models.js";
import { hashPassword } from "../auth.js";

process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-0123456789";

let replSet;
export let app;

export async function startTestServer() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await connectDb(replSet.getUri());
  app = createApp({ staticDir: "/nonexistent" });
  return app;
}

export async function stopTestServer() {
  await mongoose.disconnect();
  // mongod drops its sockets on shutdown; that ECONNRESET is expected noise, not a failure.
  process.on("uncaughtException", (e) => { if (e?.code !== "ECONNRESET") throw e; });
  await replSet?.stop();
}

export async function resetDb() {
  await Promise.all(Object.values(TABLES).map((m) => m.deleteMany({})));
  await TABLES.app_settings.create({ key: "main", balance: 0 });
}

let seq = 0;
/**
 * Creates a staff account and returns a logged-in supertest agent.
 * opts: { role, branch, fullName, password, requiresPasswordChange }
 */
export async function loginAs(role = "admin", opts = {}) {
  seq += 1;
  const email = (opts.email ?? `user${seq}@example.com`).toLowerCase();
  const phone = opts.phone ?? `05${String(10000000 + seq).slice(-8)}`;
  const password = opts.password ?? "Passw0rd!";
  const fullName = opts.fullName ?? `${role} user ${seq}`;
  const [first, ...rest] = fullName.split(" ");
  const user = await AppUser.create({ email, first_name: first, last_name: rest.join(" "), role, phone, branch: opts.branch ?? "", requires_password_change: false });
  const profile = await Profile.create({
    id: user.id, phone, email, full_name: fullName, branch: opts.branch ?? "", role,
    password_hash: await hashPassword(password), requires_password_change: opts.requiresPasswordChange ?? false,
  });
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, profile, phone, email, password };
}

/** Calls an RPC and returns { status, data, error }. */
export async function rpc(agent, name, params = {}) {
  const res = await agent.post(`/api/rpc/${name}`).send(params);
  return { status: res.status, data: res.body?.data, error: res.body?.error };
}

export const anon = () => request.agent(app);
