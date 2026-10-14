import { publicVoucherUrl } from "@/lib/publicUrl";
import { useMemo, useState } from "react";
import { Copy, LockOpen, SquareArrowOutUpRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { logActivity } from "@/lib/activityLog";
import { currentActor } from "@/store/appStore";
import { unlockWorkerLink } from "@/lib/workerLink.functions";
import { Pager, usePaged } from "@/components/ui/Pager";
import { toast } from "sonner";

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { useAppStore, useCurrentUser } from "@/store/appStore";

const linkUrl = (id: string) =>
  publicVoucherUrl(id);

/** Recently produced worker links, scoped to the viewer's role, with copy-again. */
export function ProducedLinks({ limit }: { limit?: number }) {
  const links = useAppStore((s) => s.links);
  const vouchers = useAppStore((s) => s.vouchers);
  const role = useAppStore((s) => s.role);
  const authId = useAppStore((s) => s.authId);
  const me = useCurrentUser();

  const rows = useMemo(() => {
    let list = links;
    if (role === "branch") list = list.filter((l) => l.branch === me?.branch);
    if (role === "supervisor") list = list.filter((l) => l.supervisorId === authId);
    return limit ? list.slice(0, limit) : list;
  }, [links, role, me?.branch, authId, limit]);

  const paged = usePaged(rows);
  const unlockFn = useServerFn(unlockWorkerLink);
  const [busy, setBusy] = useState<string | null>(null);
  const canUnlock = (l: { supervisorId?: string }) => role === "admin" || (!!authId && l.supervisorId === authId);
  async function unlock(id: string) {
    setBusy(id);
    try {
      await unlockFn({ data: { id } });
      useAppStore.setState((s) => ({ links: s.links.map((l) => (l.id === id ? { ...l, locked: false } : l)) }));
      logActivity(currentActor(), "שחרור לינק נעול", `קישור ${id}`);
      toast.success("מונה הניסיונות אופס והלינק פתוח");
    } catch (e) {
      toast.error((e as Error).message || "שחרור הלינק נכשל");
    } finally {
      setBusy(null);
    }
  }

  const clientsOf = (serials: string[]) => {
    const set = new Set(serials);
    return Array.from(new Set(vouchers.filter((v) => set.has(v.serial)).map((v) => v.client).filter(Boolean))).join(", ");
  };

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(linkUrl(id));
      toast.success("הלינק הועתק — ניתן לשלוח שוב לעובד");
    } catch {
      toast.error("ההעתקה נכשלה");
    }
  }

  return (
    <>
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>תאריך</TableHeaderCell>
          <TableHeaderCell>שם עובד</TableHeaderCell>
          <TableHeaderCell>לקוחות</TableHeaderCell>
          <TableHeaderCell>סכום</TableHeaderCell>
          <TableHeaderCell>סטטוס</TableHeaderCell>
          <TableHeaderCell className="text-center">לינק</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
              עדיין לא הופקו שוברים
            </TableCell>
          </TableRow>
        ) : (
          paged.slice.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="tabular-nums whitespace-nowrap">{l.createdAt}</TableCell>
              <TableCell className="font-semibold">{l.employeeName ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{clientsOf(l.serials) || "—"}</TableCell>
              <TableCell className="tabular-nums">{l.total.toLocaleString("he-IL")} ₪</TableCell>
              <TableCell>
                {l.locked ? <Badge variant="danger">נעול</Badge> : <Badge variant={l.signedAt ? "success" : "info"}>{l.signedAt ? "נחתם" : "ממתין לחתימה"}</Badge>}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-center gap-1">
                  <button
                    aria-label="העתק לינק"
                    onClick={() => void copy(l.id)}
                    className="grid size-8 place-items-center rounded-md text-primary hover:bg-blue-100"
                  >
                    <Copy className="size-4" />
                  </button>
                  <a
                    aria-label="פתח לינק"
                    href={linkUrl(l.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid size-8 place-items-center rounded-md text-primary hover:bg-blue-100"
                  >
                    <SquareArrowOutUpRight className="size-4" />
                  </a>
                  <button
                    aria-label="שחרר נעילה ואפס ניסיונות"
                    title={canUnlock(l) ? "שחרור נעילה / איפוס ניסיונות שגויים" : "רק מי שהפיק את השובר או אדמין"}
                    disabled={busy === l.id || !canUnlock(l)}
                    onClick={() => void unlock(l.id)}
                    className={`grid size-8 place-items-center rounded-md disabled:cursor-not-allowed disabled:opacity-40 ${l.locked ? "text-danger hover:bg-red-100" : "text-primary hover:bg-blue-100"}`}
                  >
                    <LockOpen className="size-4" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
    {limit ? null : <Pager {...paged} />}
    </>
  );
}
