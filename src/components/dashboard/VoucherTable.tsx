import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronRight, ChevronLeft, FileDown, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/design-system/delek-1ea111";
import { AllocationDialog } from "./AllocationDialog";
import { formatAssignment, type VoucherRecord } from "./voucherData";
import { downloadCsv, heDate, statusVariant } from "./statusVariant";
import { useAppStore } from "@/store/appStore";

const columnHelper = createColumnHelper<VoucherRecord>();

export function VoucherTable() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const vouchers = useAppStore((s) => s.vouchers);
  const role = useAppStore((s) => s.role);

  const columns = useMemo(
    () => [
      columnHelper.accessor("serial", {
        header: 'מס"ד',
        cell: (info) => <span className="font-semibold tabular-nums">{info.getValue()}</span>,
      }),
      columnHelper.accessor("amount", {
        header: "סכום",
        cell: (info) => (
          <span className="tabular-nums">{info.getValue().toLocaleString("he-IL")} ₪</span>
        ),
      }),
      columnHelper.accessor((row) => formatAssignment(row), {
        id: "assignedTo",
        header: "שויך ל",
      }),
      columnHelper.accessor("status", {
        header: "סטטוס",
        cell: (info) => (
          <Badge variant={statusVariant[info.getValue()]} size="md">
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("updatedAt", {
        header: "תאריך עדכון",
        cell: (info) => (
          <span className="tabular-nums text-muted-foreground">
            {heDate.format(new Date(info.getValue()))}
          </span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: vouchers,
    columns,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).trim().toLowerCase();
      if (!q) return true;
      const v = row.original;
      return (
        v.serial.toLowerCase().includes(q) ||
        formatAssignment(v).toLowerCase().includes(q) ||
        v.realCode.toLowerCase().includes(q)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  const { pageIndex } = table.getState().pagination;

  function exportCsv() {
    const rows = table
      .getFilteredRowModel()
      .rows.map((r) => [
        r.original.serial,
        r.original.amount,
        formatAssignment(r.original),
        r.original.status,
        r.original.updatedAt,
      ]);
    downloadCsv("vouchers.csv", ['מס"ד', "סכום", "שויך ל", "סטטוס", "תאריך עדכון"], rows);
    toast.success("הייצוא לאקסל הושלם בהצלחה");
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-secondary">
          פעילות שוברים אחרונה
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='חיפוש לפי מס"ד או שיוך'
              aria-label='חיפוש לפי מס"ד או שיוך'
              className="pe-9"
            />
          </div>
          <Button variant="outline" onClick={exportCsv}>
            <FileDown className="size-4" />
            ייצוא לאקסל
          </Button>
          {role !== "supervisor" ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              הקצאת שוברים
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <Table>
          <TableHead>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHeaderCell key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHeaderCell>
                ))}
              </TableRow>
            ))}
          </TableHead>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  לא נמצאו שוברים מתאימים
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm tabular-nums text-muted-foreground">
          עמוד {pageIndex + 1} מתוך {table.getPageCount() || 1} ·{" "}
          {table.getFilteredRowModel().rows.length} רשומות
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronRight className="size-4" />
            הקודם
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            הבא
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>

      <AllocationDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </section>
  );
}
