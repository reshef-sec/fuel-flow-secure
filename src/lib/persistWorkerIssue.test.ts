import { describe, expect, test } from "bun:test";
import { persistWorkerIssue } from "./persistWorkerIssue";

describe("employee link persistence", () => {
  test("waits for the link write before reporting success", async () => {
    const calls: string[] = [];
    await persistWorkerIssue(
      async () => { calls.push("vouchers"); return { error: null }; },
      async () => { calls.push("link"); return { error: null }; },
    );
    expect(calls).toEqual(["vouchers", "link"]);
  });
  test("rejects a failed link write rather than publishing an invalid link", async () => {
    await expect(persistWorkerIssue(
      async () => ({ error: null }),
      async () => ({ error: { message: "link insert failed" } }),
    )).rejects.toThrow("link insert failed");
  });
  test("does not save a link when the vouchers fail", async () => {
    let saved = false;
    await expect(persistWorkerIssue(
      async () => ({ error: { message: "voucher write failed" } }),
      async () => { saved = true; return { error: null }; },
    )).rejects.toThrow("voucher write failed");
    expect(saved).toBe(false);
  });
});