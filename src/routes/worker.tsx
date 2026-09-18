import { lazy, Suspense, useState } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { z } from "zod";

import { Button, Card, Checkbox, FormField, Input, Logo } from "@/design-system/delek-1ea111";
import { SuccessView } from "@/components/worker/SuccessView";

const SignatureField = lazy(() => import("@/components/worker/SignatureField"));

const VOUCHER_CODE = "1234-ABCD-5678";

const formSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { message: "נא להזין שם מלא" })
    .max(80, { message: "שם ארוך מדי" }),
  idNumber: z
    .string()
    .trim()
    .regex(/^\d{9}$/, { message: "ת.ז חייבת להכיל 9 ספרות" }),
  phone: z
    .string()
    .trim()
    .regex(/^0\d{1,2}-?\d{7}$/, { message: "מספר טלפון לא תקין" }),
});

type Errors = Partial<Record<"fullName" | "idNumber" | "phone" | "signature" | "consent", string>>;

export const Route = createFileRoute("/worker")({
  head: () => ({
    meta: [
      { title: "טופס קבלת שובר דלק | רשף ביטחון" },
      {
        name: "description",
        content: "טופס דיגיטלי לקבלת שובר דלק לעובדי רשף ביטחון — מזהה, טלפון וחתימה דיגיטלית.",
      },
      { property: "og:title", content: "טופס קבלת שובר דלק | רשף ביטחון" },
      {
        property: "og:description",
        content: "מלאו ת.ז וטלפון, חתמו על המסך וקבלו את שובר הדלק.",
      },
    ],
  }),
  component: WorkerForm,
});

/** Standalone mobile-first worker form; also rendered by /worker/$token. */
export function WorkerForm() {
  const [fullName, setFullName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const filled = fullName.trim() !== "" && idNumber.trim() !== "" && phone.trim() !== "";
  const canSubmit = filled && hasSignature && consent && !loading;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const next: Errors = {};
    const parsed = formSchema.safeParse({ fullName, idNumber, phone });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        next[issue.path[0] as keyof Errors] = issue.message;
      }
    }
    if (!hasSignature) next.signature = "נדרשת חתימה דיגיטלית";
    if (!consent) next.consent = "נא לאשר את קבלת השובר";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setDone(true);
    }, 2000);
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md" padding="none" radius="xl">
        <div className="flex flex-col items-center gap-3 border-b border-border px-6 py-6">
          <Logo size="lg" />
          <div className="w-full rounded-md bg-mint-100 px-4 py-2 text-center">
            <h1 className="font-display text-lg font-extrabold text-secondary">
              {done ? "אישור קבלת שובר" : "טופס קבלת שובר דלק"}
            </h1>
          </div>
        </div>

        {done ? (
          <SuccessView code={VOUCHER_CODE} />
        ) : (
          <form className="flex flex-col gap-5 px-6 py-6" onSubmit={handleSubmit} noValidate>
            <FormField label="שם פרטי ומשפחה" error={errors.fullName}>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                invalid={Boolean(errors.fullName)}
                placeholder="לדוגמה: ישראל ישראלי"
                maxLength={80}
                autoComplete="name"
              />
            </FormField>

            <FormField label="תעודת זהות (ת.ז)" error={errors.idNumber}>
              <Input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                invalid={Boolean(errors.idNumber)}
                inputMode="numeric"
                placeholder="9 ספרות"
                autoComplete="off"
              />
            </FormField>

            <FormField label="טלפון" error={errors.phone}>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d-]/g, "").slice(0, 11))}
                invalid={Boolean(errors.phone)}
                inputMode="tel"
                placeholder="05X-XXXXXXX"
                autoComplete="tel"
              />
            </FormField>

            <ClientOnly
              fallback={
                <div className="h-[186px] rounded-md border-2 border-dashed border-blue-300 bg-slate-50" />
              }
            >
              <Suspense
                fallback={
                  <div className="h-[186px] rounded-md border-2 border-dashed border-blue-300 bg-slate-50" />
                }
              >
                <SignatureField
                  error={errors.signature}
                  onChange={(value) => {
                    setHasSignature(value);
                    if (value) setErrors((prev) => ({ ...prev, signature: undefined }));
                  }}
                />
              </Suspense>
            </ClientOnly>

            <div className="flex flex-col gap-1">
              <Checkbox
                label="אני מאשר/ת קבלת שובר דלק"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              {errors.consent ? (
                <p className="text-xs font-medium text-danger">{errors.consent}</p>
              ) : null}
            </div>

            <Button type="submit" size="lg" block loading={loading} disabled={!canSubmit}>
              {!loading ? <ShieldCheck className="size-5" /> : null}
              {loading ? "שולח..." : "שלח טופס וקבל שובר"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              הפרטים נשמרים לצורכי בקרה בלבד ומאובטחים במערכת רשף ביטחון.
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
