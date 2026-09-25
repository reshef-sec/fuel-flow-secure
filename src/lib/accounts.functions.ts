import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalAuth as requireSupabaseAuth } from "./externalAuth";
import { normalizePhone, phoneToLoginEmail } from "./phoneLogin";

const accountSchema = z.object({
  phone: z.string().trim().min(9).max(20),
  nationalId: z.string().trim().regex(/^\d{9}$/),
  fullName: z.string().trim().max(120).default(""),
  branch: z.string().trim().max(120).default(""),
  role: z.enum(["admin", "branch", "supervisor"]),
});
type AccountInput = z.infer<typeof accountSchema>;

async function admin() {
  const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
  return supabaseAdmin;
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("אין הרשאה לפעולה זו");
}

/** Creates the account if missing, or resets it to password = ת.ז. */
async function upsertAccount(input: AccountInput, resetPassword: boolean) {
  const sb = await admin();
  const phone = normalizePhone(input.phone);
  const { data: existing } = await sb
    .from("profiles")
    .select("id")
    .or(`phone.eq.${phone},national_id.eq.${input.nationalId}`)
    .maybeSingle();

  let userId = existing?.id as string | undefined;
  if (!userId) {
    const { data, error } = await sb.auth.admin.createUser({
      email: phoneToLoginEmail(phone),
      password: input.nationalId,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(/weak|pwned|guess/i.test(error?.message ?? "") ? "ת.ז זו נחסמה כסיסמה חלשה — יש לבחור ת.ז אחרת" : error?.message ?? "יצירת החשבון נכשלה");
    userId = data.user.id;
  } else {
    const patch: { email: string; password?: string } = { email: phoneToLoginEmail(phone) };
    if (resetPassword) patch.password = input.nationalId;
    const { error } = await sb.auth.admin.updateUserById(userId, { ...patch, email_confirm: true });
    if (error) throw new Error(error.message);
  }

  const profile: {
    id: string; phone: string; national_id: string; full_name: string; branch: string;
    role: AccountInput["role"]; updated_at: string; requires_password_change?: boolean;
  } = {
    id: userId,
    phone,
    national_id: input.nationalId,
    full_name: input.fullName,
    branch: input.branch,
    role: input.role,
    updated_at: new Date().toISOString(),
  };
  if (resetPassword || !existing) profile.requires_password_change = true;
  const { error: pErr } = await sb.from("profiles").upsert(profile);
  if (pErr) throw new Error(pErr.message);

  await sb.from("user_roles").delete().eq("user_id", userId);
  await sb.from("user_roles").insert({ user_id: userId, role: input.role });
  return { ok: true };
}

/** Public: tells the login page whether first-time setup is needed. */
export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { count } = await sb.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return { needsSetup: (count ?? 0) === 0 };
});

/** Public, but only works while no admin exists: creates the first admin. */
export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => accountSchema.omit({ role: true }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { count } = await sb.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("ההגדרה הראשונית כבר בוצעה");
    return upsertAccount({ ...data, role: "admin" }, true);
  });

/** Admin: create/update a login account for a user (password untouched if it exists). */
export const syncAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => accountSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return upsertAccount(data, false);
  });

/** Admin: reset password back to ת.ז and force a change on next login. */
export const resetAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => accountSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return upsertAccount(data, true);
  });

/** Admin: remove a login account. */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ nationalId: z.string().regex(/^\d{9}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = await admin();
    const { data: p } = await sb.from("profiles").select("id").eq("national_id", data.nationalId).maybeSingle();
    if (!p) return { ok: true };
    if (p.id === context.userId) throw new Error("לא ניתן למחוק את החשבון המחובר");
    await sb.from("user_roles").delete().eq("user_id", p.id);
    await sb.from("profiles").delete().eq("id", p.id);
    await sb.auth.admin.deleteUser(p.id);
    return { ok: true };
  });

/** Signed-in user: set a new password and clear the forced-change flag. */
export const completePasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: p } = await sb.from("profiles").select("national_id").eq("id", context.userId).single();
    if (p?.national_id === data.password) throw new Error("הסיסמה החדשה חייבת להיות שונה מתעודת הזהות");
    const { error } = await sb.auth.admin.updateUserById(context.userId, { password: data.password });
    if (error) throw new Error(error.message);
    await sb.from("profiles").update({ requires_password_change: false }).eq("id", context.userId);
    return { ok: true };
  });
