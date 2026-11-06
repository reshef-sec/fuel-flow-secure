/**
 * A learning copy from an older version may be incomplete (its users can be gone), and an owner left
 * inside it would see that instead of the real system. Return them to real data; the next
 * activation rebuilds the copy.
 */
export async function leaveStaleLearning(db, seedVersion) {
  const meta = await db.collection("learning_meta").findOne({ _id: "seed" });
  if (meta?.version !== seedVersion) {
    await db.collection("profiles").updateMany({ learning_mode: true }, { $set: { learning_mode: false } });
  }
}

/**
 * Moves users from national id to a stable internal id and email. Runs at startup, before indexes
 * are built, and is safe to repeat. Works on the raw collections because the models no longer
 * have national_id. The old values stay stored (unused and never sent to the browser).
 */
import { randomUUID } from "node:crypto";

const USER_COLLECTIONS = ["app_users", "profiles", "learning_app_users", "learning_profiles"];

export async function migrateUserIdentity(db) {
  // Old unique indexes would reject a second user with no national id or phone.
  for (const name of USER_COLLECTIONS) {
    const col = db.collection(name);
    const indexes = await col.indexes().catch(() => []);
    for (const ix of indexes) {
      if (ix.key.national_id != null || (ix.key.phone != null && !ix.partialFilterExpression)) await col.dropIndex(ix.name);
    }
  }

  // Demo users are rebuilt from the real directory on the next activation.
  await db.collection("learning_app_users").deleteMany({ id: { $exists: false } });

  const users = db.collection("app_users");
  const profiles = db.collection("profiles");
  const requests = db.collection("voucher_requests");

  // Every directory entry gets a stable id, equal to its login profile's id when it has one.
  for await (const u of users.find({ id: { $exists: false } })) {
    const profile = u.national_id ? await profiles.findOne({ national_id: u.national_id }, { projection: { id: 1 } }) : null;
    const id = profile?.id ?? randomUUID();
    await users.updateOne({ _id: u._id }, { $set: { id } });
    // Requests pointed at the requester's national id.
    if (u.national_id) await requests.updateMany({ requester_id: u.national_id }, { $set: { requester_id: id } });
  }

  // The owner's email, so the switch to DEV_TOOLS_OWNER_EMAIL keeps their access.
  const ownerEmail = String(process.env.DEV_TOOLS_OWNER_EMAIL ?? "").trim().toLowerCase();
  const ownerId = String(process.env.DEV_TOOLS_OWNER_NATIONAL_ID ?? "").trim();
  if (ownerEmail && ownerId) {
    const noEmail = { national_id: ownerId, $or: [{ email: null }, { email: { $exists: false } }] };
    await users.updateOne(noEmail, { $set: { email: ownerEmail } });
    await profiles.updateOne(noEmail, { $set: { email: ownerEmail } });
  }
}
