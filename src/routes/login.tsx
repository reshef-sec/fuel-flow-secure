import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Lock, Smartphone } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button, FormField, Input, Logo } from "@/design-system/delek-1ea111";
import { supabase } from "@/lib/supabaseClient";
import { bootstrapAdmin, getSetupStatus } from "@/lib/accounts.functions";
import { phoneToLoginEmail } from "@/lib/phoneLogin";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "כניסה למערכת | רשף ביטחון" },
      { name: "description", content: "כניסה מאובטחת למערכת ניהול שוברי הדלק של רשף ביטחון." },
      { property: "og:title", content: "כניסה למערכת | רשף ביטחון" },
      { property: "og:description", content: "כניסה מאובטחת עם מספר נייד וסיסמה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const status = useServerFn(getSetupStatus);
  const bootstrap = useServerFn(bootstrapAdmin);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    status().then((r) => setNeedsSetup(r.needsSetup)).catch(() => undefined);
  }, [status]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim() || !password) {
      setError("יש למלא מספר נייד וסיסמה");
      return;
    }
    setBusy(true);
    try {
      if (needsSetup) {
        if (!/^\d{9}$/.test(password)) throw new Error("בהגדרה הראשונית יש להזין ת.ז בת 9 ספרות");
        await bootstrap({ data: { phone, nationalId: password, fullName, branch: "" } });
        toast.success("חשבון מנהל ראשי נוצר");
      }
      const { error: err } = await supabase.auth.signInWithPassword({
        email: phoneToLoginEmail(phone),
        password,
      });
      if (err) throw new Error("מספר נייד או סיסמה שגויים");
    } catch (err) {
      setError(err instanceof Error ? err.message : "הכניסה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm"
        noValidate
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo className="h-24 sm:h-28" />
          <h1 className="font-display text-xl font-extrabold text-secondary">
            {needsSetup ? "הגדרת מנהל ראשי" : "כניסה למערכת"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {needsSetup
              ? "טרם הוגדר מנהל. הזינו את פרטיכם — הסיסמה הראשונית היא תעודת הזהות."
              : "סיסמה ראשונית: מספר תעודת הזהות"}
          </p>
        </div>

        {needsSetup ? (
          <FormField label="שם מלא">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </FormField>
        ) : null}

        <FormField label="מספר נייד">
          <div className="relative">
            <Smartphone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="username"
              dir="ltr"
              className="ps-9 text-right"
              aria-label="מספר נייד"
            />
          </div>
        </FormField>

        <FormField label={needsSetup ? "ת.ז" : "סיסמה"}>
          <div className="relative">
            <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
              className="ps-9 text-right"
              aria-label="סיסמה"
            />
          </div>
        </FormField>

        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "מתחבר…" : needsSetup ? "צור מנהל והתחבר" : "כניסה"}
        </Button>
      </form>
    </main>
  );
}
