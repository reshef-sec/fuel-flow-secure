import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, CardHeader, CardTitle, Input } from "@/design-system/delek-1ea111";
import { useAppStore } from "@/store/appStore";

export function ReasonsPanel() {
  const reasons = useAppStore((s) => s.reasons);
  const addReason = useAppStore((s) => s.addReason);
  const updateReason = useAppStore((s) => s.updateReason);
  const removeReason = useAppStore((s) => s.removeReason);
  const [draft, setDraft] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <CardTitle>סיבות הנפקה</CardTitle>
      </CardHeader>
      <p className="text-sm text-muted-foreground">
        הסיבות שיוצגו לקציני הרכב ולמפקחים בעת הנפקת שובר לעובד.
      </p>

      <form
        className="mt-5 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = draft.trim();
          if (!value) return;
          addReason(value);
          setDraft("");
          toast.success("סיבת ההנפקה נוספה");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="סיבת הנפקה חדשה"
          aria-label="סיבת הנפקה חדשה"
          className="min-w-0 flex-1"
        />
        <Button type="submit">
          <Plus className="size-4" />
          הוספה
        </Button>
      </form>

      <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
        {reasons.length === 0 ? (
          <li className="p-5 text-center text-sm text-muted-foreground">לא הוגדרו סיבות הנפקה</li>
        ) : (
          reasons.map((reason, index) => (
            <li key={`${reason}-${index}`} className="flex items-center gap-2 px-4 py-3">
              {editIndex === index ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    aria-label="עריכת סיבת הנפקה"
                    className="min-w-0 flex-1"
                  />
                  <button
                    aria-label="שמור"
                    onClick={() => {
                      const value = editValue.trim();
                      if (!value) return;
                      updateReason(index, value);
                      setEditIndex(null);
                      toast.success("סיבת ההנפקה עודכנה");
                    }}
                    className="grid size-9 place-items-center rounded-md text-teal-600 outline-none hover:bg-surface-muted focus-visible:shadow-focus"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    aria-label="בטל עריכה"
                    onClick={() => setEditIndex(null)}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none hover:bg-surface-muted focus-visible:shadow-focus"
                  >
                    <X className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-secondary">
                    {reason}
                  </span>
                  <button
                    aria-label={`ערוך ${reason}`}
                    onClick={() => {
                      setEditIndex(index);
                      setEditValue(reason);
                    }}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none hover:bg-surface-muted hover:text-primary focus-visible:shadow-focus"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    aria-label={`מחק ${reason}`}
                    onClick={() => {
                      removeReason(index);
                      toast.success("סיבת ההנפקה נמחקה");
                    }}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none hover:bg-surface-muted hover:text-danger focus-visible:shadow-focus"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}
