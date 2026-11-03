import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Badge, Input, Select } from "@/design-system/delek-1ea111";
import { isReadOnlyRole, reasonCategoryLabels, useAppStore, type ReasonCategory } from "@/store/appStore";
import { EmptyNote, SettingsCard } from "./shared";

function CategorySelect({ value, onChange }: { value: ReasonCategory; onChange: (v: ReasonCategory) => void }) {
  return (
    <Select
      aria-label="סוג רכב"
      value={value}
      onChange={(e) => onChange(e.target.value as ReasonCategory)}
      className="h-11 w-full rounded-control min-[900px]:w-40"
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
    <SettingsCard
      label="סיבות הנפקה"
      title="סיבות הנפקה"
      sub={<><span className="ds-num">{reasons.length}</span> סיבות</>}
      className="max-w-4xl"
    >
      {readOnly ? null : (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-table-line px-[18px] py-3"
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
            className="h-11 min-w-0 flex-1 basis-56 rounded-control"
          />
          <CategorySelect value={draftCat} onChange={setDraftCat} />
          <button type="submit" className="ds-btn ds-btn-primary max-[899.98px]:w-full" disabled={!draft.trim()}>
            <Plus className="size-4" aria-hidden />
            הוספה
          </button>
        </form>
      )}

      {reasons.length === 0 ? (
        <EmptyNote>לא הוגדרו סיבות הנפקה</EmptyNote>
      ) : (
        <ul className="m-0 list-none divide-y divide-table-line p-0">
          {reasons.map((reason, index) => (
            <li key={`${reason.name}-${index}`} className="flex flex-wrap items-center gap-2 px-[18px] py-2.5">
              {editIndex === index && !readOnly ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    aria-label="עריכת סיבת הנפקה"
                    className="h-11 min-w-0 flex-1 basis-56 rounded-control"
                  />
                  <CategorySelect value={editCat} onChange={setEditCat} />
                  <button
                    type="button"
                    aria-label="שמור"
                    onClick={() => {
                      const value = editValue.trim();
                      if (!value) return;
                      updateReason(index, { name: value, category: editCat });
                      setEditIndex(null);
                      toast.success("סיבת ההנפקה עודכנה");
                    }}
                    className="ds-iconbtn text-available-fg"
                  >
                    <Check className="size-4" />
                  </button>
                  <button type="button" aria-label="בטל עריכה" onClick={() => setEditIndex(null)} className="ds-iconbtn">
                    <X className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-navy-900">{reason.name}</span>
                  <Badge variant={reason.category === "B2B" ? "info" : "muted"} size="md" className="font-bold">
                    {reasonCategoryLabels[reason.category]}
                  </Badge>
                  {readOnly ? null : (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className="ds-rowact"
                        aria-label={`עריכת ${reason.name}`}
                        onClick={() => {
                          setEditIndex(index);
                          setEditValue(reason.name);
                          setEditCat(reason.category);
                        }}
                      >
                        עריכה
                      </button>
                      <button
                        type="button"
                        className="ds-rowact !text-redeemed-fg"
                        aria-label={`הסרת ${reason.name}`}
                        onClick={() => {
                          removeReason(index);
                          toast.success("סיבת ההנפקה נמחקה");
                        }}
                      >
                        הסרה
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
