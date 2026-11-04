/** סרטוני הדרכה — owner-only management; public links show the video only and can be revoked. */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, resetDb, loginAs, anon } from "./helpers.js";
import { TrainingShare } from "../routes/training.js";
import { REAL } from "../models.js";

before(startTestServer);
after(stopTestServer);
beforeEach(async () => { await resetDb(); await TrainingShare.deleteMany({}); });

async function owner() {
  const o = await loginAs("admin", { fullName: "קורן מאיה" });
  process.env.DEV_TOOLS_OWNER_NATIONAL_ID = o.nationalId;
  return o;
}

describe("training videos", () => {
  it("only the owner can list, stream or share", async () => {
    await owner();
    for (const role of ["admin", "branch", "supervisor", "viewer"]) {
      const { agent } = await loginAs(role, { branch: "חיפה" });
      assert.equal((await agent.get("/api/training")).status, 403, role);
      assert.equal((await agent.get("/api/training/video/admin")).status, 403, role);
      assert.equal((await agent.post("/api/training/shares").send({ video: "admin" })).status, 403, role);
    }
    assert.equal((await anon().get("/api/training")).status, 401);
  });

  it("a viewing link plays the video only, counts views, and stops working once revoked", async () => {
    const o = await owner();
    const list = await o.agent.get("/api/training");
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.videos.map((v) => v.id).sort(), ["admin", "intro"]);

    const created = await o.agent.post("/api/training/shares").send({ video: "intro" });
    assert.equal(created.status, 200);
    const { token } = created.body;
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await o.agent.post("/api/training/shares").send({ video: "nope" })).status, 400);

    const viewer = anon();
    const pub = await viewer.get(`/api/training/public/${token}`);
    assert.equal(pub.status, 200);
    assert.deepEqual(Object.keys(pub.body).sort(), ["title", "video"]);
    // The link grants nothing else: the viewer is still anonymous everywhere in the system.
    assert.equal((await viewer.get("/api/auth/me")).status === 200 && (await viewer.get("/api/auth/me")).body.profile != null, false);
    assert.equal((await viewer.post("/api/db/vouchers").send({ op: "select" })).status, 401);
    assert.equal((await viewer.get("/api/training")).status, 401);
    assert.equal((await TrainingShare.findOne({ token }).lean()).views, 1);

    assert.equal((await o.agent.delete(`/api/training/shares/${token}`).send({})).status, 200);
    assert.equal((await viewer.get(`/api/training/public/${token}`)).status, 404);
    assert.equal((await viewer.get(`/api/training/public/${token}/video`)).status, 404);
    assert.equal((await anon().get("/api/training/public/not-a-real-token")).status, 404);
  });

  it("works the same inside the learning environment and never touches learning data", async () => {
    const o = await owner();
    await REAL.Profile.updateOne({ id: o.profile.id }, { $set: { learning_mode: true } });
    const r = await o.agent.post("/api/training/shares").send({ video: "admin" });
    assert.equal(r.status, 200);
    assert.equal(await TrainingShare.countDocuments({ token: r.body.token }), 1);
    assert.equal((await anon().get(`/api/training/public/${r.body.token}`)).status, 200);
  });
});
