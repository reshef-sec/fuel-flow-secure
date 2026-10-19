import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { persistWorkerIssue } from "./persistWorkerIssue";

describe("employee link persistence", () => {
  test("waits for the link write before reporting success", async () => {
    const calls: string[] = [];
    await persistWorkerIssue(
      async () => { calls.push("vouchers"); return { error: null }; },
      async () => { calls.push("link"); return { error: null }; },
    );
    assert.deepEqual(calls, ["vouchers", "link"]);
  });
  test("rejects a failed link write rather than publishing an invalid link", async () => {
    await assert.rejects(persistWorkerIssue(
      async () => ({ error: null }),
      async () => ({ error: { message: "link insert failed" } }),
    ), /link insert failed/);
  });
  test("does not save a link when the vouchers fail", async () => {
    let saved = false;
    await assert.rejects(persistWorkerIssue(
      async () => ({ error: { message: "voucher write failed" } }),
      async () => { saved = true; return { error: null }; },
    ), /voucher write failed/);
    assert.equal(saved, false);
  });
});