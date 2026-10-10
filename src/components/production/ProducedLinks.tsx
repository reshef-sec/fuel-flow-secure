import { publicVoucherUrl } from "@/lib/publicUrl";
import { useMemo } from "react";
import { Copy, SquareArrowOutUpRight } from "lucide-react";
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
          rows.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="tabular-nums whitespace-nowrap">{l.createdAt}</TableCell>
              <TableCell className="font-semibold">{l.employeeName ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{clientsOf(l.serials) || "—"}</TableCell>
              <TableCell className="tabular-nums">{l.total.toLocaleString("he-IL")} ₪</TableCell>
              <TableCell>
                <Badge variant={l.signedAt ? "success" : "info"}>{l.signedAt ? "נחתם" : "ממתין לחתימה"}</Badge>
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
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
