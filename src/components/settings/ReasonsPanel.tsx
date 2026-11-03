import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Card, CardHeader, CardTitle, Input, Select } from "@/design-system/delek-1ea111";
import { isReadOnlyRole, reasonCategoryLabels, useAppStore, type ReasonCategory } from "@/store/appStore";

function CategorySelect({ value, onChange }: { value: ReasonCategory; onChange: (v: ReasonCategory) => void }) {
  return (
    <Select
      aria-label="קטגוריית סיבה"
      value={value}
      onChange={(e) => onChange(e.target.value as ReasonCategory)}
      className="w-40"
    >
      <option value="B2B">רכב עבודה</option>
      <option value="Regular">רכב פרטי</option>
    </Select>
  );
}

export function ReasonsPanel() {
  const reasons = useAppStore((s) => s.reasons);
  const addReason = useAppStore((s) => s.addReason);
  const updateReason = useAppStore((s) => s.updateReason);
  const removeReason = useAppStore((s) => s.removeReason);
  const readOnly = useAppStore((s) => isReadOnlyRole(s.role));
  const [draft, setDraft] = useState("");
  const [draftCat, setDraftCat] = useState<ReasonCategory>("Regular");
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editCat, setEditCat] = useState<ReasonCategory>("Regular");

  return (
    <Card padding="lg" className="max-w-3xl">
      <CardHeader>
        <CardTitle>סיבות הנפקה</CardTitle>
      </CardHeader>

      {readOnly ? null : <form
        className="mt-5 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = draft.trim();
          if (!value) return;
          addReason({ name: value, category: draftCat });
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
        <CategorySelect value={draftCat} onChange={setDraftCat} />
        <Button type="submit">
          <Plus className="size-4" />
          הוספה
        </Button>
      </form>}

      <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
        {reasons.length === 0 ? (
          <li className="p-5 text-center text-sm text-muted-foreground">לא הוגדרו סיבות הנפקה</li>
        ) : (
          reasons.map((reason, index) => (
            <li key={`${reason.name}-${index}`} className="flex items-center gap-2 px-4 py-3">
              {editIndex === index && !readOnly ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    aria-label="עריכת סיבת הנפקה"
                    className="min-w-0 flex-1"
                  />
                  <CategorySelect value={editCat} onChange={setEditCat} />
                  <button
                    aria-label="שמור"
                    onClick={() => {
                      const value = editValue.trim();
                      if (!value) return;
                      updateReason(index, { name: value, category: editCat });
                      setEditIndex(null);
                      toast.success("סיבת ההנפקה עודכנה");
                    }}
                    className="grid size-9 place-items-center rounded-md text-teal-600 hover:bg-surface-muted"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    aria-label="בטל עריכה"
                    onClick={() => setEditIndex(null)}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted"
                  >
                    <X className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-secondary">
                    {reason.name}
                  </span>
                  <Badge variant={reason.category === "B2B" ? "info" : "neutral"}>
                    {reason.category === "B2B" ? "B2B" : "רגיל"} · {reasonCategoryLabels[reason.category]}
                  </Badge>
                  {readOnly ? null : <>
                  <button
                    aria-label={`ערוך ${reason.name}`}
                    onClick={() => {
                      setEditIndex(index);
                      setEditValue(reason.name);
                      setEditCat(reason.category);
                    }}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-primary"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    aria-label={`מחק ${reason.name}`}
                    onClick={() => {
                      removeReason(index);
                      toast.success("סיבת ההנפקה נמחקה");
                    }}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  </>}
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}
