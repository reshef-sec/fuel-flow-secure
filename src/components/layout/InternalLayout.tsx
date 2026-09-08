import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Ticket,
  Building2,
  Users,
  FileBarChart,
  ScrollText,
  Menu,
  Bell,
  UserCircle2,
  X,
} from "lucide-react";

import { Logo } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";

const navItems = [
  { to: "/", label: "דשבורד", icon: LayoutDashboard },
  { to: "/vouchers", label: "מאגר שוברים", icon: Ticket },
  { to: "/allocations", label: "הקצאות לסניפים", icon: Building2 },
  { to: "/users", label: "ניהול משתמשים", icon: Users },
  { to: "/reports", label: "דוחות", icon: FileBarChart },
  { to: "/audit", label: "יומן פעולות", icon: ScrollText },
] as const;

export function InternalLayout({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
          "fixed inset-y-0 right-0 z-40 w-64 shrink-0 border-s border-border bg-surface transition-transform lg:static lg:translate-x-0",
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

        <nav className="flex flex-col gap-1 p-3">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
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
            <button
              aria-label="התראות"
              className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted"
            >
              <Bell className="size-5" />
            </button>
            <span className="flex items-center gap-2 rounded-pill bg-surface-muted px-3 py-1.5">
              <UserCircle2 className="size-5 text-secondary" />
              <span className="hidden text-sm font-semibold text-secondary sm:inline">
                אדמין מרכזי
              </span>
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
