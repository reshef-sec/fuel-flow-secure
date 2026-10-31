import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanUserName, userDisplayName } from "./userDisplay";
describe("authenticated user display", () => {
  it("keeps real full names and rejects placeholder names", () => {
    assert.equal(cleanUserName(" מאיה  קורן "), "מאיה קורן");
    assert.equal(cleanUserName("text text"), "");
  });
  it("falls back to the account phone then its role", () => {
    assert.equal(userDisplayName({ full_name: "text text", phone: "0500000000", role: "admin" }), "0500000000");
    assert.equal(userDisplayName({ full_name: " ", role: "branch" }), "מנהל סניף");
  });
});