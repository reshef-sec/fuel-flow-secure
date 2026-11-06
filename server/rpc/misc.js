import { Profile } from "../models.js";

export default {
  /** True until the first admin account exists (login page shows the bootstrap form). */
  needs_setup: {
    auth: "public",
    handler: async () => !(await Profile.exists({ role: "admin" })),
  },
};
