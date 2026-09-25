import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const idSchema = z.object({ id: z.string().regex(/^\d{4,12}$/) });
const identSchema = idSchema.extend({
  workerId: z.string().regex(/^\d{9}$/),
  phone: z.string().regex(/^0\d{8,9}$/),
});

type Code = { serial: string; realCode: string; amount: number };

async function codesFor(serials: string[]): Promise<Code[]> {
  const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
  const { data } = await supabaseAdmin.from("vouchers").select("serial, real_code, amount").in("serial", serials);
  return (data ?? []).map((r) => ({ serial: r.serial, realCode: r.real_code, amount: r.amount }));
}

/** Public: whether the link exists and was already signed (no codes). */
export const getWorkerLinkStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => idSchema.parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
    const { data: link } = await supabaseAdmin
      .from("worker_links").select("total, worker_id").eq("id", data.id).maybeSingle();
    if (!link) return { exists: false as const };
    return { exists: true as const, total: link.total, signed: Boolean(link.worker_id) };
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
  .inputValidator((d) => identSchema.parse(d))
  .handler(async ({ data }) => {
    const supabaseAdmin = (await import("@/lib/supabaseAdmin.server")).getAdmin();
    const today = new Date().toISOString().slice(0, 10);
    const { data: link } = await supabaseAdmin
      .from("worker_links")
      .update({ worker_id: data.workerId, phone: data.phone, signed_at: today })
      .eq("id", data.id).is("worker_id", null).select("*").maybeSingle();
    if (!link) return { ok: false as const, codes: [] as Code[] };
    await supabaseAdmin.from("vouchers").update({ worker_id: data.workerId }).in("serial", link.serials);
    return { ok: true as const, codes: await codesFor(link.serials) };
  });
