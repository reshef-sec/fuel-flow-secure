import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canUseDevelopmentTools, isResetConfirmed } from "./developmentAccess";

describe("Maya-only development controls", () => {
  it("allows only the identity verified by the database", () => {
    assert.equal(canUseDevelopmentTools("maya-id", "maya-id"), true);
    assert.equal(canUseDevelopmentTools("another-admin", "maya-id"), false);
    assert.equal(canUseDevelopmentTools("supervisor", "maya-id"), false);
    assert.equal(canUseDevelopmentTools(undefined, "maya-id"), false);
    assert.equal(canUseDevelopmentTools("maya-id", null), false);
  });
  it("requires explicit reset confirmation", () => {
    assert.equal(isResetConfirmed("איפוס וניקוי נתונים"), true);
    assert.equal(isResetConfirmed(""), false);
    assert.equal(isResetConfirmed("אישור"), false);
  });
});