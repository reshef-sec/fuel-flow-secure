import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  const now = new Date().toISOString();
  // Blocked or expired (3 months after issue) codes are hidden from the employee.
  return ((data ?? []) as Record<string, any>[])
    .filter((r) => r.status !== "חסום" && !(r.expires_at && r.expires_at < now && r.status !== "מומש סופית"))
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
    return { exists: true as const, total: l.total as number, signed: Boolean(l.worker_id), employeeName: (l.employee_name as string | null) ?? "" };
  });

/** Public: returns codes only when ID + phone match the signed owner. */
export const openWorkerWallet = createServerFn({ method: "POST" })
  .inputValidator((d) => identSchema.parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
    const { data: link } = await supabaseAdmin
      .from("worker_links").select("*").eq("id", data.id).maybeSingle();
    if (!link || link.worker_id !== data.workerId || link.phone !== data.phone)
      return { ok: false as const, codes: [] as Code[] };
    return { ok: true as const, codes: await codesFor(link.serials) };
  });

/** Public: first signature claims the link, then returns its codes. */
export const signWorkerLink = createServerFn({ method: "POST" })
  .inputValidator((d) => signSchema.parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
    const today = new Date().toISOString().slice(0, 10);
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
