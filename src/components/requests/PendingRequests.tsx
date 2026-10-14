import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { fullName, roleLabels, useAppStore, useCurrentUser } from "@/store/appStore";

/** Admin-only queue of voucher requests awaiting approval. */
export function PendingRequests() {
  const requests = useAppStore((s) => s.requests);
  const balance = useAppStore((s) => s.balance);
  const approveRequest = useAppStore((s) => s.approveRequest);
  const rejectRequest = useAppStore((s) => s.rejectRequest);
  const me = useCurrentUser();
  const users = useAppStore((s) => s.users);
  const roleOf = (r: { requesterId: string; requester: string }) => {
    const u = users.find((x) => x.id === r.requesterId) ?? users.find((x) => fullName(x) === r.requester);
    return u ? u.title || roleLabels[u.role] : "—";
  };
  const approver = me ? fullName(me) : "אדמין מרכזי";

  const [customId, setCustomId] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  const pending = requests.filter((r) => r.status === "ממתין לאישור");

  function approve(id: string, amount: number) {
    if (amount % 50 !== 0 || amount <= 0) {
      toast.error("הסכום חייב להיות בכפולות של 50 ₪");
      return;
    }
    if (amount > balance) {
      toast.error("הסכום גבוה מהיתרה הזמינה לחלוקה");
      return;
    }
    approveRequest(id, amount, approver);
    setCustomId(null);
    setCustomAmount("");
    toast.success(`הדרישה אושרה והוקצו ${amount.toLocaleString("he-IL")} ₪`);
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-extrabold text-secondary">
          דרישות ממתינות לאישור
        </h2>
        <Badge variant={pending.length ? "warning" : "neutral"} size="md">
          {pending.length} ממתינות
        </Badge>
      </div>

      <Card padding="lg" className="mt-4">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>דורש</TableHeaderCell>
              <TableHeaderCell>סניף</TableHeaderCell>
              <TableHeaderCell>תפקיד</TableHeaderCell>
              <TableHeaderCell>סכום מבוקש</TableHeaderCell>
              <TableHeaderCell>סיבה</TableHeaderCell>
              <TableHeaderCell className="text-center">פעולות</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pending.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  אין דרישות ממתינות לאישור
                </TableCell>
              </TableRow>
            ) : (
              pending.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.requester}</TableCell>
                  <TableCell>{r.branch}</TableCell>
                  <TableCell>{roleOf(r)}</TableCell>
                  <TableCell className="tabular-nums">
                    {r.amount.toLocaleString("he-IL")} ₪
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.reason}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button size="sm" onClick={() => approve(r.id, r.amount)}>
                        <Check className="size-4" />
                        אשר במלואו
                      </Button>
                      {customId === r.id ? (
                        <span className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={50}
                            step={50}
                            aria-label="סכום מאושר"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            placeholder="סכום"
                            className="h-9 w-28 tabular-nums"
                          />
                          <Button size="sm" onClick={() => approve(r.id, Number(customAmount))}>
                            אשר
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCustomId(r.id);
                            setCustomAmount(String(r.amount));
                          }}
                        >
                          <Pencil className="size-4" />
                          אשר סכום אחר
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          rejectRequest(r.id, approver);
                          toast.success("הדרישה נדחתה");
                        }}
                      >
                        <X className="size-4" />
                        דחה
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
