import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicPath, isWorkerPublicPath } from "./publicPaths";

test("employee wallet bypasses staff access gates", () => {
  assert.equal(isWorkerPublicPath("/voucher/24521197"), true);
  assert.equal(isWorkerPublicPath("/v/abc123"), true);
  assert.equal(isPublicPath("/v/abc123"), true);
  assert.equal(isPublicPath("/voucher/24521197"), true);
  assert.equal(isWorkerPublicPath("/worker/123456"), true);
});
test("public wallet exemption does not include staff voucher inventory", () => {
  assert.equal(isPublicPath("/vouchers"), false);
  assert.equal(isWorkerPublicPath("/vouchers"), false);
  assert.equal(isPublicPath("/settings"), false);
});