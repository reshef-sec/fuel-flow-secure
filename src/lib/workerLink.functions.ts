import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalAuth } from "./externalAuth";

const MAX_ATTEMPTS = 3;
/** Employee access links expire 3 months after issue; vouchers themselves never expire. */
function linkExpired(l: Record<string, any>) {
  const base = new Date(l.created_at ?? l.created_on);
  if (Number.isNaN(base.getTime())) return false;
  base.setMonth(base.getMonth() + 3);
  return base.getTime() < Date.now();
}
const isLocked = (l: Record<string, any>) => Boolean(l.locked) || Number(l.failed_attempts ?? 0) >= MAX_ATTEMPTS;

const idSchema = z.object({ id: z.string().regex(/^\d{4,12}$/) });
const identSchema = idSchema.extend({
  workerId: z.string().regex(/^\d{9}$/),
  phone: z.string().regex(/^0\d{8,9}$/),
});

const signSchema = identSchema.extend({
  fullName: z.string().trim().min(2).max(80),
  signature: z.string().startsWith("data:image/png;base64,").max(800_000),
});

type Code = { serial: string; realCode: string; amount: number };

async function codesFor(serials: string[]): Promise<Code[]> {
  const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
  const sb = supabaseAdmin as any;
  const { data } = await sb.from("vouchers").select("serial, real_code, amount, status, expires_at").in("serial", serials);
  const { data: codeRows } = await sb.from("voucher_codes").select("serial, real_code").in("serial", serials);
  const real = new Map(((codeRows ?? []) as { serial: string; real_code: string }[]).map((r) => [r.serial, r.real_code]));
  // Blocked codes are hidden from the employee. Vouchers never expire.
  return ((data ?? []) as Record<string, any>[])
    .filter((r) => r.status !== "חסום")
    .map((r) => ({ serial: r.serial, realCode: real.get(r.serial) || r.real_code, amount: r.amount }));
}

/** Public: whether the link exists and was already signed (no codes). */
export const getWorkerLinkStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => idSchema.parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
    const { data: link } = await supabaseAdmin
      .from("worker_links").select("*").eq("id", data.id).maybeSingle();
    if (!link) return { exists: false as const };
    const l = link as Record<string, any>;
    if (linkExpired(l)) return { exists: true as const, state: "expired" as const, total: 0, signed: false, employeeName: "" };
    if (isLocked(l)) return { exists: true as const, state: "locked" as const, total: 0, signed: false, employeeName: "" };
    return { exists: true as const, state: "ok" as const, total: l.total as number, signed: Boolean(l.worker_id), employeeName: (l.employee_name as string | null) ?? "" };
  });

/** Public: returns codes only when ID + phone match the signed owner. */
export const openWorkerWallet = createServerFn({ method: "POST" })
  .inputValidator((d) => identSchema.parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
    const { data: link } = await supabaseAdmin
      .from("worker_links").select("*").eq("id", data.id).maybeSingle();
    if (!link) return { ok: false as const, state: "invalid" as const, attemptsLeft: 0, codes: [] as Code[] };
    const l = link as Record<string, any>;
    if (linkExpired(l)) return { ok: false as const, state: "expired" as const, attemptsLeft: 0, codes: [] as Code[] };
    if (isLocked(l)) return { ok: false as const, state: "locked" as const, attemptsLeft: 0, codes: [] as Code[] };
    if (l.worker_id !== data.workerId || l.phone !== data.phone) {
      const attempts = Number(l.failed_attempts ?? 0) + 1;
      const locked = attempts >= MAX_ATTEMPTS;
      await (supabaseAdmin as any).from("worker_links")
        .update({ failed_attempts: attempts, locked, ...(locked ? { locked_at: new Date().toISOString() } : {}) })
        .eq("id", data.id);
      return { ok: false as const, state: locked ? ("locked" as const) : ("mismatch" as const), attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts), codes: [] as Code[] };
    }
    if (l.failed_attempts) await (supabaseAdmin as any).from("worker_links").update({ failed_attempts: 0 }).eq("id", data.id);
    return { ok: true as const, state: "ok" as const, attemptsLeft: MAX_ATTEMPTS, codes: await codesFor(l.serials) };
  });

/** Public: first signature claims the link, then returns its codes. */
export const signWorkerLink = createServerFn({ method: "POST" })
  .inputValidator((d) => signSchema.parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
    const today = new Date().toISOString().slice(0, 10);
    const { data: cur } = await supabaseAdmin.from("worker_links").select("*").eq("id", data.id).maybeSingle();
    if (!cur || linkExpired(cur as Record<string, any>) || isLocked(cur as Record<string, any>))
      return { ok: false as const, codes: [] as Code[] };
    const { data: link } = await supabaseAdmin
      .from("worker_links")
      .update({ worker_id: data.workerId, phone: data.phone, signed_at: today })
      .eq("id", data.id).is("worker_id", null).select("*").maybeSingle();
    if (!link) return { ok: false as const, codes: [] as Code[] };
    await supabaseAdmin
      .from("vouchers")
      .update({ worker_id: data.workerId, worker_name: data.fullName, employee_id: data.workerId, employee_phone: data.phone, employee_name: data.fullName } as never)
      .in("serial", link.serials);
    const codes = await codesFor(link.serials);
    const l = link as Record<string, any>;
    const { error: archiveError } = await (supabaseAdmin as any).from("signatures_archive").insert({
      link_id: data.id,
      branch: l.branch ?? null,
      supervisor_id: l.supervisor_id ?? null,
      employee_name: data.fullName,
      employee_id_number: data.workerId,
      employee_phone: data.phone,
      total_amount: codes.reduce((s, c) => s + c.amount, 0) || l.total,
      voucher_record_ids: l.serials,
      signature_image_url: data.signature,
    });
    if (archiveError) console.error("signatures_archive insert failed", archiveError.message);
    return { ok: true as const, codes };
  });

/** Staff: unlock a link after 3 failed attempts. Only its issuer or an admin. */
export const unlockWorkerLink = createServerFn({ method: "POST" })
  .middleware([requireExternalAuth])
  .inputValidator((d) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin() as any;
    const { data: link } = await supabaseAdmin.from("worker_links").select("id, supervisor_id").eq("id", data.id).maybeSingle();
    if (!link) throw new Error("הלינק לא נמצא");
    if (!isAdmin && link.supervisor_id !== ctx.userId) throw new Error("רק מי שהפיק את השובר או אדמין יכולים לשחרר את הלינק");
    const { error } = await supabaseAdmin.from("worker_links").update({ failed_attempts: 0, locked: false, locked_at: null }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
