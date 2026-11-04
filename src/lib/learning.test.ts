import { test } from "node:test";
import assert from "node:assert/strict";
import { getLearningStatus, isLearningResetConfirmed, LEARNING_RESET_CONFIRMATION, setLearningMode } from "./learning";

type Call = { url: string; init: RequestInit };
function mockFetch(status: number, body: unknown, calls: Call[]) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as typeof fetch;
}

test("reset of the learning data needs the exact typed phrase", () => {
  assert.equal(isLearningResetConfirmed(LEARNING_RESET_CONFIRMATION), true);
  assert.equal(isLearningResetConfirmed(`  ${LEARNING_RESET_CONFIRMATION} `), true);
  assert.equal(isLearningResetConfirmed("איפוס וניקוי נתונים"), false);
  assert.equal(isLearningResetConfirmed(""), false);
});

test("status is read from GET /api/learning and normalized", async () => {
  const calls: Call[] = [];
  mockFetch(200, { active: true, seeded: true, counts: { vouchers: 40, links: 6 } }, calls);
  const s = await getLearningStatus();
  assert.equal(calls[0]!.url, "/api/learning");
  assert.equal(calls[0]!.init.method, "GET");
  assert.deepEqual(s, { active: true, seeded: true, counts: { vouchers: 40, links: 6, requests: 0, users: 0 } });
});

test("actions POST { action } and surface the server's message on 403", async () => {
  const calls: Call[] = [];
  mockFetch(200, { ok: true, active: false, seeded: true, counts: { vouchers: 1, links: 0, requests: 0, users: 2 } }, calls);
  const s = await setLearningMode("pause");
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal(calls[0]!.init.body, JSON.stringify({ action: "pause" }));
  assert.equal(s.active, false);

  mockFetch(403, { error: "סביבת הלימוד זמינה למנהלת המערכת בלבד" }, calls);
  await assert.rejects(() => setLearningMode("activate"), /למנהלת המערכת בלבד/);
});
