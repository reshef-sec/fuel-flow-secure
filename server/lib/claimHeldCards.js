import { AppUser, Voucher } from "../models.js";

/**
 * A supervisor can receive cards before their first login: until then the cards are held by name
 * (supervisor set, supervisor_id empty). When the account is created, link them to it, so the
 * supervisor's own-scope reads and issuance see them right away.
 */
export async function claimHeldCards(profile) {
  if (profile.role !== "supervisor") return;
  const u = await AppUser.findOne({ id: profile.id }, { last_name: 1, first_name: 1 }).lean();
  const name = u ? [u.last_name, u.first_name].filter((x) => x != null).join(" ").trim() : "";
  if (!name) return;
  await Voucher.updateMany({ supervisor: name, supervisor_id: null, branch: profile.branch }, { $set: { supervisor_id: profile.id } });
}
