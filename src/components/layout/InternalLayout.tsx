import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Ticket,
  Building2,
  Users,
  FileBarChart,
  ScrollText,
  Settings,
  UserCheck,
  PenLine,

  Menu,
  Bell,
  UserCircle2,
  X, LogOut, History } from "lucide-react";

import { Logo, Select } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { useAuthContext } from "@/lib/auth-context";
import { useIsSuperAdmin } from "@/lib/superAdmin";
import { supabase } from "@/lib/supabaseClient";
import { roleLabels, storedRole, useAppStore, type Role } from "@/store/appStore";

const navItems = [
  { to: "/", label: "דשבורד", icon: LayoutDashboard, roles: ["admin", "branch", "supervisor"] },
  { to: "/vouchers", label: "מאגר שוברים", icon: Ticket, roles: ["admin"] },
  { to: "/allocations", label: "הקצאות לסניפים", icon: Building2, roles: ["admin"] },
  { to: "/supervisor", label: "הפקת שוברי דלק", icon: UserCheck, roles: ["admin", "branch", "supervisor"] },
  { to: "/produced", label: "שוברים שהופקו", icon: History, roles: ["admin", "branch", "supervisor"] },
  { to: "/reports", label: "דוחות", icon: FileBarChart, roles: ["admin", "branch", "supervisor"] },
  { to: "/signatures", label: "ארכיון חתימות", icon: PenLine, roles: ["admin", "branch", "supervisor"] },
  { to: "/settings", label: "הגדרות", icon: Settings, roles: ["admin"] },
] as const;



export function InternalLayout({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const { profile } = useAuthContext();
  const canSimulate = useIsSuperAdmin();

  // Restore the simulated role after hydration so permissions survive a reload.
  useEffect(() => {
    if (!profile) return;
    if (!canSimulate) {
      setRole(profile.role);
      return;
    }
    const saved = storedRole();
    if (saved && saved !== useAppStore.getState().role) setRole(saved);
  }, [setRole, canSimulate, profile]);

  const items = navItems.filter((item) => (item.roles as readonly string[]).includes(role));

  return (
    <div className="flex min-h-screen w-full bg-background">
      {open ? (
        <button
          aria-label="סגור תפריט"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-navy-900/40 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto border-s border-border bg-surface transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-20 items-center justify-between gap-2 border-b border-border px-5">
          <Logo size="md" />
          <button
            onClick={() => setOpen(false)}
            aria-label="סגור תפריט"
            className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-4 py-4">
          {items.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-card"
                    : "text-secondary hover:bg-blue-100 hover:text-blue-700",
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <button
            onClick={() => setOpen(true)}
            aria-label="פתח תפריט"
            className="grid size-9 place-items-center rounded-md text-secondary hover:bg-surface-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="min-w-0 truncate font-display text-lg font-extrabold text-secondary">
            {title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {canSimulate ? <Select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              aria-label="תפקיד לצפייה"
              className="h-9 w-auto text-xs font-semibold"
            >
              {(Object.keys(roleLabels) as Role[]).map((r) => (
                <option key={r} value={r}>
                  תצוגה: {roleLabels[r]}
                </option>
              ))}
            </Select> : null}
            <button
              aria-label="התראות"
              className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted"
            >
              <Bell className="size-5" />
            </button>
            <span className="hidden items-center gap-2 rounded-pill bg-surface-muted px-3 py-1.5 sm:flex">
              <UserCircle2 className="size-5 text-secondary" />
              <span className="text-sm font-semibold text-secondary">{profile?.full_name || roleLabels[role]}</span>
            </span>
            <button
              onClick={() => void supabase.auth.signOut()}
              aria-label="התנתקות"
              title="התנתקות"
              className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-danger"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
