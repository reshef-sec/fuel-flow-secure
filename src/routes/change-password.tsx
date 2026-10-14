import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button, FormField, Input, Logo } from "@/design-system/delek-1ea111";
import { completePasswordChange } from "@/lib/backend";
import { useAuthContext } from "@/lib/auth-context";

export const Route = createFileRoute("/change-password")({
  head: () => ({
    meta: [
      { title: "עדכון סיסמה | רשף ביטחון" },
      { name: "description", content: "עדכון סיסמה ראשונית לפני כניסה למערכת שוברי הדלק." },
      { property: "og:title", content: "עדכון סיסמה | רשף ביטחון" },
      { property: "og:description", content: "בחירת סיסמה חדשה ומאובטחת." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const save = completePasswordChange;
  const { refresh, session } = useAuthContext();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError("הסיסמה חייבת להכיל לפחות 8 תווים");
    if (pw !== confirm) return setError("הסיסמאות אינן תואמות");
    setError(null);
    setBusy(true);
    try {
      await save({ data: { password: pw } });
      toast.success("הסיסמה עודכנה בהצלחה");
      await refresh();
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון הסיסמה נכשל");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return null;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <form onSubmit={onSubmit} noValidate className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo className="h-24 sm:h-28" />
          <KeyRound className="size-6 text-primary" />
          <h1 className="font-display text-xl font-extrabold text-secondary">עדכון סיסמה</h1>
          <p className="text-sm text-muted-foreground">יש לבחור סיסמה חדשה לפני הכניסה למערכת.</p>
        </div>
        <FormField label="סיסמה חדשה">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" dir="ltr" className="text-right" aria-label="סיסמה חדשה" />
        </FormField>
        <FormField label="אימות סיסמה">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" dir="ltr" className="text-right" aria-label="אימות סיסמה" />
        </FormField>
        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "שומר…" : "שמור סיסמה"}
        </Button>
      </form>
    </main>
  );
}
