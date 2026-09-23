import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Card,
  FormField,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { downloadCsv } from "@/components/dashboard/statusVariant";
import { isSheetFile, parseSheetFile, stripHeader } from "@/lib/parseSheet";
import { useAppStore } from "@/store/appStore";

const empty = {
  licensePlate: "",
  driverName: "",
  standardName: "",
  linkedClientCode: "",
  linkedSiteCode: "",
};

const PAGE_SIZE = 25;

export function VehiclesPanel() {
  const vehicles = useAppStore((s) => s.vehicles);
  const clients = useAppStore((s) => s.clients);
  const addVehicle = useAppStore((s) => s.addVehicle);
  const updateVehicle = useAppStore((s) => s.updateVehicle);
  const importVehicles = useAppStore((s) => s.importVehicles);
  const removeVehicle = useAppStore((s) => s.removeVehicle);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const siteOf = (clientCode: string, siteCode: string) =>
    clients.find((c) => c.clientId === clientCode && c.siteId === siteCode);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return vehicles;
    return vehicles.filter((v) =>
      [v.licensePlate, v.driverName, v.standardName, v.linkedClientCode, v.linkedSiteCode].some(
        (value) => value.includes(q),
      ),
    );
  }, [vehicles, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isSheetFile(file.name)) {
      toast.error("יש להעלות קובץ אקסל (xlsx, xls) או CSV");
      return;
    }
    try {
      const raw = stripHeader(await parseSheetFile(file), "רישוי");
      const rows = raw
        .filter((r) => (r[0] ?? "").length > 0)
        .map((r) => ({
          licensePlate: String(r[0] ?? "").trim(),
          driverName: String(r[1] ?? "").trim(),
          standardName: String(r[2] ?? "").trim(),
          linkedClientCode: String(r[3] ?? "").trim(),
          linkedSiteCode: String(r[4] ?? "").trim(),
        }));
      if (rows.length === 0) {
        toast.error("לא נמצאו שורות תקינות. עמודות: רישוי רכב, שם נהג, שם תקן, מס' לקוח, מספר אתר");
        return;
      }
      const { added, updated } = importVehicles(rows);
      setPage(0);
      toast.success(
        `נוספו ${added.toLocaleString("he-IL")} רכבים, עודכנו ${updated.toLocaleString("he-IL")}`,
      );
    } catch {
      toast.error("קריאת הקובץ נכשלה. יש לוודא שהקובץ תקין");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      licensePlate: form.licensePlate.trim(),
      driverName: form.driverName.trim(),
      standardName: form.standardName.trim(),
      linkedClientCode: form.linkedClientCode.trim(),
      linkedSiteCode: form.linkedSiteCode.trim(),
    };
    if (
      !payload.licensePlate ||
      !payload.driverName ||
      !payload.standardName ||
      !payload.linkedClientCode ||
      !payload.linkedSiteCode
    ) {
      setError("יש למלא את כל השדות");
      return;
    }
    if (!siteOf(payload.linkedClientCode, payload.linkedSiteCode)) {
      setError("שילוב מס' לקוח ומספר אתר אינו קיים במאגר הלקוחות");
      return;
    }
    if (vehicles.some((v) => v.licensePlate === payload.licensePlate && v.licensePlate !== editing)) {
      setError("רישוי רכב זה קיים כבר במאגר");
      return;
    }
    setError(null);
    if (editing) {
      updateVehicle(editing, payload);
      toast.success("פרטי הרכב עודכנו");
    } else {
      addVehicle(payload);
      toast.success("הרכב נוסף בהצלחה");
    }
    setForm(empty);
    setEditing(null);
    setOpen(false);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-secondary">
          מאגר רכבים ותקנים
          <span className="ms-2 text-sm font-semibold text-muted-foreground">
            {filtered.length.toLocaleString("he-IL")} מתוך {vehicles.length.toLocaleString("he-IL")}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="חיפוש רישוי או נהג"
              aria-label="חיפוש רכבים"
              className="w-64 pe-9"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              downloadCsv(
                "vehicles-template.csv",
                ["רישוי רכב", "שם נהג", "שם תקן", "מס' לקוח", "מספר אתר"],
                [["12-345-67", "שם נהג לדוגמה", "תקן 1204", "38", "74"]],
              );
              toast.success("תבנית הרכבים הורדה");
            }}
          >
            <FileSpreadsheet className="size-4" />
            הורד תבנית אקסל
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setError(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            הוספה ידנית
          </Button>
        </div>
      </div>

      <Card padding="lg" className="mt-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center transition-colors",
            dragging ? "border-primary bg-blue-100" : "border-border bg-surface-muted",
          )}
        >
          <span className="grid size-12 place-items-center rounded-xl bg-blue-100 text-blue-700">
            <UploadCloud className="size-6" />
          </span>
          <p className="font-display text-base font-extrabold text-secondary">
            ייבוא רכבים ותקנים מקובץ אקסל
          </p>
          <p className="text-sm text-muted-foreground">
            עמודות נדרשות: רישוי רכב, שם נהג, שם תקן, מס' לקוח, מספר אתר · רישוי קיים יתעדכן
          </p>
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
            <FileSpreadsheet className="size-4" />
            בחירת קובץ
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label="בחירת קובץ רכבים"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </Card>

      <div className="mt-6">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>רישוי רכב</TableHeaderCell>
              <TableHeaderCell>שם נהג</TableHeaderCell>
              <TableHeaderCell>שם תקן</TableHeaderCell>
              <TableHeaderCell>לקוח מקושר</TableHeaderCell>
              <TableHeaderCell>אתר מקושר</TableHeaderCell>
              <TableHeaderCell>פעולות</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  לא נמצאו רכבים מתאימים
                </TableCell>
              </TableRow>
            ) : (
              visible.map((v) => {
                const site = siteOf(v.linkedClientCode, v.linkedSiteCode);
                return (
                  <TableRow key={v.licensePlate}>
                    <TableCell className="font-semibold tabular-nums" dir="ltr">
                      {v.licensePlate}
                    </TableCell>
                    <TableCell>{v.driverName}</TableCell>
                    <TableCell>{v.standardName}</TableCell>
                    <TableCell>
                      {site?.clientName ?? "—"}{" "}
                      <span className="tabular-nums text-muted-foreground">
                        ({v.linkedClientCode})
                      </span>
                    </TableCell>
                    <TableCell>
                      {site?.siteName ?? "—"}{" "}
                      <span className="tabular-nums text-muted-foreground">
                        ({v.linkedSiteCode})
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          aria-label={`ערוך ${v.licensePlate}`}
                          onClick={() => {
                            setEditing(v.licensePlate);
                            setForm({ ...v });
                            setError(null);
                            setOpen(true);
                          }}
                          className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-primary focus-visible:shadow-focus"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          aria-label={`מחק ${v.licensePlate}`}
                          onClick={() => {
                            removeVehicle(v.licensePlate);
                            toast.success("הרכב נמחק");
                          }}
                          className="grid size-9 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-surface-muted hover:text-danger focus-visible:shadow-focus"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          עמוד {current + 1} מתוך {pageCount}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronRight className="size-4" />
            הקודם
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            הבא
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "עריכת רכב" : "הוספת רכב"}>
        <form onSubmit={submit} className="space-y-5">
          <FormField label="רישוי רכב">
            <Input
              value={form.licensePlate}
              onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
              aria-label="רישוי רכב"
              className="tabular-nums"
              dir="ltr"
            />
          </FormField>
          <FormField label="שם נהג">
            <Input
              value={form.driverName}
              onChange={(e) => setForm({ ...form, driverName: e.target.value })}
              aria-label="שם נהג"
            />
          </FormField>
          <FormField label="שם תקן">
            <Input
              value={form.standardName}
              onChange={(e) => setForm({ ...form, standardName: e.target.value })}
              aria-label="שם תקן"
            />
          </FormField>
          <FormField label="מס' לקוח מקושר">
            <Input
              value={form.linkedClientCode}
              onChange={(e) => setForm({ ...form, linkedClientCode: e.target.value })}
              inputMode="numeric"
              aria-label="מס' לקוח מקושר"
              className="tabular-nums"
            />
          </FormField>
          <FormField label="מספר אתר מקושר">
            <Input
              value={form.linkedSiteCode}
              onChange={(e) => setForm({ ...form, linkedSiteCode: e.target.value })}
              inputMode="numeric"
              aria-label="מספר אתר מקושר"
              className="tabular-nums"
            />
          </FormField>

          {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit">{editing ? "שמירת שינויים" : "הוספה"}</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
