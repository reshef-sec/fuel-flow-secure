import { test } from "node:test";
import assert from "node:assert/strict";
import { isDemoSearchValue, publicVoucherUrl } from "./publicUrl";

test("worker links use the actual Netlify origin", () => {
  assert.equal(publicVoucherUrl("24521197", "https://delekcards.netlify.app"), "https://delekcards.netlify.app/voucher/24521197");
});
test("custom deployments and server rendering never use a hardcoded origin", () => {
  assert.equal(publicVoucherUrl("123456", "https://fuel.example.org"), "https://fuel.example.org/voucher/123456");
  assert.equal(publicVoucherUrl("123456", ""), "/voucher/123456");
});
test("learning-environment links carry ?demo=1, real links never do", () => {
  assert.equal(publicVoucherUrl("123456", "https://fuel.example.org", true), "https://fuel.example.org/voucher/123456?demo=1");
  assert.equal(publicVoucherUrl("123456", "", true), "/voucher/123456?demo=1");
  assert.equal(publicVoucherUrl("123456", "https://fuel.example.org", false), "https://fuel.example.org/voucher/123456");
});
test("only demo=1 turns the employee page into demo mode", () => {
  assert.equal(isDemoSearchValue(1), true);
  assert.equal(isDemoSearchValue("1"), true);
  for (const v of [undefined, null, 0, "0", "", "true", true, ["1"]]) assert.equal(isDemoSearchValue(v), false);
});
