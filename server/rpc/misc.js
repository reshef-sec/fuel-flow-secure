import { Profile } from "../models.js";

export default {
  /** True until the first admin account exists (login page shows the bootstrap form). */
  needs_setup: {
    auth: "public",
    handler: async () => !(await Profile.exists({ role: "admin" })),
  },
  lookup_auth_id: {
    auth: "staff",
    handler: async ({ p_national_id }) =>
      (await Profile.findOne({ national_id: String(p_national_id ?? "") }, { id: 1 }).lean())?.id ?? null,
  },
};
