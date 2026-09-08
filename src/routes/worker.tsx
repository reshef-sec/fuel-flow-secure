import { createFileRoute } from "@tanstack/react-router";
import { PenLine, ShieldCheck } from "lucide-react";

import {
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  Logo,
} from "@/design-system/delek-1ea111";

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

function WorkerForm() {
  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md" padding="none" radius="xl">
        <div className="flex flex-col items-center gap-3 border-b border-border px-6 py-6">
          <Logo size="lg" />
          <div className="w-full rounded-md bg-mint-100 px-4 py-2 text-center">
            <h1 className="font-display text-lg font-extrabold text-secondary">
              טופס קבלת שובר דלק
            </h1>
          </div>
        </div>

        <form className="flex flex-col gap-5 px-6 py-6" onSubmit={(e) => e.preventDefault()}>
          <FormField label="שם פרטי ומשפחה">
            <Input placeholder="לדוגמה: ישראל ישראלי" autoComplete="name" />
          </FormField>

          <FormField label="תעודת זהות (ת.ז)">
            <Input
              inputMode="numeric"
              placeholder="9 ספרות"
              maxLength={9}
              autoComplete="off"
            />
          </FormField>

          <FormField label="טלפון">
            <Input inputMode="tel" placeholder="05X-XXXXXXX" autoComplete="tel" />
          </FormField>

          <div className="flex flex-col gap-1.5">
            <span className="block text-sm font-semibold text-foreground">תתימה פיזית</span>
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-blue-300 bg-slate-50 text-center">
              <PenLine className="size-6 text-blue-500" />
              <span className="text-sm font-semibold text-muted-foreground">
                Signature Pad Placeholder
              </span>
              <span className="text-xs text-muted-foreground">אנא חתמו כאן (ציור על המסך)</span>
            </div>
          </div>

          <Checkbox label="אני מאשר/ת קבלת שובר דלק" />

          <Button type="submit" size="lg" block>
            <ShieldCheck className="size-5" />
            שלח טופס וקבל שובר
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            הפרטים נשמרים לצורכי בקרה בלבד ומאובטחים במערכת רשף ביטחון.
          </p>
        </form>
      </Card>
    </div>
  );
}
