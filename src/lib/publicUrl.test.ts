import { test } from "node:test";
import assert from "node:assert/strict";
import { publicVoucherUrl } from "./publicUrl";

test("worker links use the actual Netlify origin", () => {
  assert.equal(publicVoucherUrl("24521197", "https://delekcards.netlify.app"), "https://delekcards.netlify.app/voucher/24521197");
});
test("custom deployments and server rendering never use a hardcoded origin", () => {
  assert.equal(publicVoucherUrl("123456", "https://fuel.example.org"), "https://fuel.example.org/voucher/123456");
  assert.equal(publicVoucherUrl("123456", ""), "/voucher/123456");
});