import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, rpc, anon } from "./helpers.js";
import { ActivityLog, B2BClient, RegularClient } from "../models.js";

before(startTestServer);
after(stopTestServer);
beforeEach(resetDb);

/** Mirror of src/lib/cloudSync.ts b2bToRow — what the client posts after header matching. */
const b2bRow = (c) => ({
  client_code: c.clientCode, account_name: c.accountName ?? "", client_name: c.clientName ?? "", branch: c.branch ?? "",
  standard: c.standard, balance: c.balance ?? null, load_type: null, budget_section: null, account_key: null,
  item_family: null, account_status: null, account_type: null, is_active: true,
});
/** Mirror of src/lib/cloudSync.ts clientToRow. */
const privRow = (c) => ({
  client_id: c.clientId, client_name: c.clientName ?? "", site_id: c.siteId, site_name: c.siteName ?? "",
  standard: c.standard ?? null, is_active: true,
});

describe("sync_work_vehicles", () => {
  it("delta-syncs by standard + client_code: deactivates missing rows, never deletes, reactivates on re-upload", async () => {
    const { agent } = await loginAs("admin", { fullName: "אדמין ראשי" });
    // Rows from a sheet whose header said 'קוד חשבון' and one whose header said 'תקן' arrive identically keyed.
    const first = [
      b2bRow({ standard: " 80620031 ", clientCode: "C1", accountName: "Shared", clientName: "First" }),
      b2bRow({ standard: "80620031", clientCode: "C1", accountName: "Shared", clientName: "Duplicate" }),
      b2bRow({ standard: "80620032", clientCode: "C1", accountName: "Shared", clientName: "Second" }),
      b2bRow({ standard: "80620033", clientCode: "C2", clientName: "Third", balance: 500 }),
      {}, { standard: "", client_code: null },
    ];
    let r = await rpc(agent, "sync_work_vehicles", { p_rows: first });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual(r.data, {
      added: 3, updated: 0, active: 3, reactivated: 0, remained_active: 0, deactivated: 0,
      duplicates: 1, blanks: 2, invalid: 0, skipped: 2,
    });
    const c31 = await B2BClient.findOne({ standard: "80620031" }).lean();
    assert.equal(c31.client_name, "First");
    assert.equal(c31.is_active, true);
    assert.equal((await B2BClient.findOne({ standard: "80620033" }).lean()).balance, "500");

    // Second upload omits 80620031 + incomplete keys are skipped (invalid), not fatal.
    r = await rpc(agent, "sync_work_vehicles", { p_rows: [
      b2bRow({ standard: "80620032", clientCode: "C1", accountName: "Renamed", clientName: "Updated" }),
      b2bRow({ standard: "80620033", clientCode: "C2", clientName: "Third" }),
      { standard: " ", client_code: "C1" }, { standard: "80620099", client_code: null }, {},
    ] });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual(r.data, {
      added: 0, updated: 2, active: 2, reactivated: 0, remained_active: 2, deactivated: 1,
      duplicates: 0, blanks: 1, invalid: 2, skipped: 3,
    });
    assert.equal(await B2BClient.countDocuments(), 3, "no row is ever deleted");
    assert.equal((await B2BClient.findOne({ standard: "80620031" }).lean()).is_active, false);
    assert.equal((await B2BClient.findOne({ standard: "80620032" }).lean()).account_name, "Renamed");

    // Re-upload brings it back.
    r = await rpc(agent, "sync_work_vehicles", { p_rows: [
      b2bRow({ standard: "80620031", clientCode: "C1", clientName: "Reactivated" }),
      b2bRow({ standard: "80620032", clientCode: "C1" }),
      b2bRow({ standard: "80620033", clientCode: "C2" }),
      b2bRow({ standard: "80620034", clientCode: "C2", clientName: "New" }),
    ] });
    assert.equal(r.data.reactivated, 1);
    assert.equal(r.data.remained_active, 2);
    assert.equal(r.data.added, 1);
    assert.equal(r.data.active, 4);
    assert.equal(r.data.deactivated, 0);
    const back = await B2BClient.findOne({ standard: "80620031" }).lean();
    assert.equal(back.is_active, true);
    assert.equal(back.client_name, "Reactivated");

    // Repeat does not count reactivation twice.
    r = await rpc(agent, "sync_work_vehicles", { p_rows: [b2bRow({ standard: "80620031", clientCode: "C1" }), b2bRow({ standard: "80620032", clientCode: "C1" }), b2bRow({ standard: "80620033", clientCode: "C2" }), b2bRow({ standard: "80620034", clientCode: "C2" })] });
    assert.equal(r.data.reactivated, 0);
    assert.equal(r.data.remained_active, 4);

    const audit = await ActivityLog.find({ action: "סנכרון מאגר רכב עבודה" }).sort({ created_at: 1 }).lean();
    assert.equal(audit.length, 4);
    assert.match(audit[0].target, /1 כפולים דולגו$/);
    assert.equal(audit[0].role, "אדמין מרכזי");
    assert.equal(audit[1].details.deactivated, 1);
  });

  it("rejects an empty / all-invalid snapshot before any write", async () => {
    const { agent } = await loginAs("admin");
    await rpc(agent, "sync_work_vehicles", { p_rows: [b2bRow({ standard: "1", clientCode: "C" })] });
    for (const p_rows of [[], [{}], [{ client_code: "C1", standard: "" }], [b2bRow({ standard: "", clientCode: "" })]]) {
      const r = await rpc(agent, "sync_work_vehicles", { p_rows });
      assert.equal(r.status, 400);
      assert.equal(r.error, "לא נמצאו רכבי עבודה תקינים; המאגר לא שונה");
    }
    assert.equal((await B2BClient.findOne({ standard: "1" }).lean()).is_active, true);
    assert.equal(await ActivityLog.countDocuments({ action: "סנכרון מאגר רכב עבודה" }), 1);
    assert.equal((await rpc(agent, "sync_work_vehicles", { p_rows: "x" })).error, "Invalid work vehicle file");
    assert.equal((await rpc(agent, "sync_work_vehicles", { p_rows: [1] })).error, "Invalid work vehicle row");
  });

  it("is admin-only", async () => {
    for (const role of ["branch", "supervisor", "viewer"]) {
      const { agent } = await loginAs(role, { branch: "חיפה" });
      const r = await rpc(agent, "sync_work_vehicles", { p_rows: [b2bRow({ standard: "1", clientCode: "C" })] });
      assert.equal(r.status, 403, role);
      if (role !== "viewer") assert.equal(r.error, "Admin access required");
    }
    assert.equal((await rpc(anon(), "sync_work_vehicles", { p_rows: [] })).status, 401);
    assert.equal(await B2BClient.countDocuments(), 0);
  });
});

describe("sync_private_vehicles", () => {
  it("delta-syncs by client_id + site_id with first-row dedup, blank skipping and reactivation", async () => {
    const { agent } = await loginAs("admin");
    let r = await rpc(agent, "sync_private_vehicles", { p_rows: [
      privRow({ clientId: " 1001 ", siteId: " 11 ", clientName: "First" }),
      privRow({ clientId: "1001", siteId: "11", clientName: "Last" }),
      privRow({ clientId: "1001", siteId: "12", clientName: "Second" }),
      {}, { client_id: "", site_id: null },
    ] });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual(r.data, { added: 2, updated: 0, deactivated: 0, duplicates: 1, blanks: 2 });
    assert.equal((await RegularClient.findOne({ site_id: "11" }).lean()).client_name, "First");

    r = await rpc(agent, "sync_private_vehicles", { p_rows: [privRow({ clientId: "1001", siteId: "12", clientName: "Updated" })] });
    assert.deepEqual(r.data, { added: 0, updated: 1, deactivated: 1, duplicates: 0, blanks: 0 });
    assert.equal(await RegularClient.countDocuments(), 2);
    assert.equal((await RegularClient.findOne({ site_id: "11" }).lean()).is_active, false);

    r = await rpc(agent, "sync_private_vehicles", { p_rows: [privRow({ clientId: "1001", siteId: "11", clientName: "Reactivated" }), privRow({ clientId: "1001", siteId: "12" })] });
    assert.deepEqual(r.data, { added: 0, updated: 2, deactivated: 0, duplicates: 0, blanks: 0 });
    const back = await RegularClient.findOne({ site_id: "11" }).lean();
    assert.equal(back.is_active, true);
    assert.equal(back.client_name, "Reactivated");
    assert.ok(await ActivityLog.exists({ action: "סנכרון מאגר רכב פרטי", target: { $regex: "1 כפולים דולגו$" } }));
  });

  it("fails on incomplete keys or empty snapshots without touching the pool", async () => {
    const { agent } = await loginAs("admin");
    await rpc(agent, "sync_private_vehicles", { p_rows: [privRow({ clientId: "1", siteId: "1" })] });
    let r = await rpc(agent, "sync_private_vehicles", { p_rows: [privRow({ clientId: "2", siteId: "2" }), { client_id: "1001", site_id: "" }] });
    assert.equal(r.status, 400);
    assert.equal(r.error, "יש למלא מספר לקוח ומספר אתר בכל שורה שאינה ריקה");
    r = await rpc(agent, "sync_private_vehicles", { p_rows: [{}, { client_id: "5" }] });
    assert.equal(r.error, "יש למלא מספר לקוח ומספר אתר בכל שורה שאינה ריקה");
    r = await rpc(agent, "sync_private_vehicles", { p_rows: [{}, {}] });
    assert.equal(r.error, "לא נמצאו רכבים פרטיים תקינים; המאגר לא שונה");
    assert.equal(await RegularClient.countDocuments({ is_active: true }), 1);
    assert.equal(await RegularClient.countDocuments(), 1);
  });

  it("is admin-only", async () => {
    const { agent } = await loginAs("supervisor");
    const r = await rpc(agent, "sync_private_vehicles", { p_rows: [privRow({ clientId: "1", siteId: "1" })] });
    assert.equal(r.status, 403);
    assert.equal(await RegularClient.countDocuments(), 0);
  });
});

describe("sync_vehicle_pool (legacy)", () => {
  it("syncs regular pool strictly and rejects duplicate keys", async () => {
    const { agent } = await loginAs("admin");
    let r = await rpc(agent, "sync_vehicle_pool", { p_pool: "regular", p_rows: [{ client_id: "1", site_id: "1" }, { client_id: "1", site_id: "2" }] });
    assert.deepEqual(r.data, { added: 2, updated: 0, deactivated: 0 });
    r = await rpc(agent, "sync_vehicle_pool", { p_pool: "regular", p_rows: [{ client_id: "1", site_id: "2", client_name: "x" }] });
    assert.deepEqual(r.data, { added: 0, updated: 1, deactivated: 1 });
    assert.equal(await RegularClient.countDocuments(), 2);
    r = await rpc(agent, "sync_vehicle_pool", { p_pool: "regular", p_rows: [{ client_id: "1", site_id: "2" }, { client_id: "1", site_id: "2" }] });
    assert.equal(r.error, "Missing or duplicate client/site key");
    assert.equal((await rpc(agent, "sync_vehicle_pool", { p_pool: "regular", p_rows: [] })).error, "Empty or invalid vehicle file");
    assert.equal((await rpc(agent, "sync_vehicle_pool", { p_pool: "x", p_rows: [{ a: 1 }] })).error, "Unknown vehicle pool");
  });
});
