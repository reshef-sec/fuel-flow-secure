import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatIsraelDate, parseIsraelDate, inDateRange } from "./israelDate";
describe("Israeli dates", () => {
  it("displays day/month/year without shifting date-only values", () => {
    assert.equal(formatIsraelDate("2026-10-31"), "31/10/2026");
    assert.equal(formatIsraelDate("2026-10-31T07:55:01Z", true), "31/10/2026 09:55:01");
  });
  it("parses localized dates into ISO and rejects invalid days", () => {
    assert.equal(parseIsraelDate("31/10/2026"), "2026-10-31");
    assert.equal(parseIsraelDate("31/02/2026"), null);
    assert.equal(parseIsraelDate("10/31/2026"), null);
    assert.equal(parseIsraelDate(""), "");
  });
  it("includes both endpoints even for timestamps on the final day", () => {
    assert.equal(inDateRange("2026-10-31T20:59:00Z", "2026-10-01", "2026-10-31"), true);
    assert.equal(inDateRange("2026-11-01", "2026-10-01", "2026-10-31"), false);
  });
});