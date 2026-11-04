/** Work-vehicle branch scope at issuance: no branch = every branch; assigned = that branch only. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workVehicleBranchAllowed } from "../lib/issuanceGuard.js";

describe("workVehicleBranchAllowed", () => {
  it("a vehicle without a branch is open to every branch", () => {
    assert.equal(workVehicleBranchAllowed("", "חיפה"), true);
    assert.equal(workVehicleBranchAllowed(null, "תל אביב"), true);
    assert.equal(workVehicleBranchAllowed("   ", "באר שבע"), true);
  });
  it("an assigned vehicle is issued only on its own branch's cards", () => {
    assert.equal(workVehicleBranchAllowed("חיפה", "חיפה"), true);
    assert.equal(workVehicleBranchAllowed("סניף חיפה", "חיפה"), true);
    assert.equal(workVehicleBranchAllowed("חיפה", "תל אביב"), false);
  });
  it("central-pool cards may use any vehicle", () => {
    assert.equal(workVehicleBranchAllowed("חיפה", "מאגר ראשי"), true);
    assert.equal(workVehicleBranchAllowed("חיפה", ""), true);
    assert.equal(workVehicleBranchAllowed("חיפה", "הנהלה"), true);
  });
});
