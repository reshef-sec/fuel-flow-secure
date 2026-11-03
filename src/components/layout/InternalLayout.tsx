import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  ChevronLeft,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  PenLine,
  Settings,
  Ticket,
  UserCheck,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/design-system/delek-1ea111";
import { cn } from "@/design-system/delek-1ea111/design-system/lib/utils";
import { useAuthContext } from "@/lib/auth-context";
import { userDisplayName } from "@/lib/userDisplay";
import { useIsSuperAdmin } from "@/lib/superAdmin";
import { signOut } from "@/lib/useAuth";
import { RealtimeNotifications } from "@/components/layout/RealtimeNotifications";
import { roleLabels, storedRole, useAppStore, type Role } from "@/store/appStore";

type NavTo = "/" | "/vouchers" | "/allocations" | "/supervisor" | "/produced" | "/reports" | "/signatures" | "/settings";

interface NavItem {
  to: NavTo;
  label: string;
  /** Short label for the mobile bottom tab bar (only items that appear there). */
  tab?: string;
  icon: LucideIcon;
  roles: readonly Role[];
}

/**
 * Main navigation, in the approved order. Role lists are the permission source for VISIBILITY only
 * (routes enforce their own access). "/vouchers" uses the same roles that see the dashboard voucher table.
 */
const navItems: readonly NavItem[] = [
  { to: "/", label: "דשבורד", tab: "דשבורד", icon: LayoutDashboard, roles: ["admin", "branch", "supervisor", "viewer"] },
  { to: "/vouchers", label: "מלאי שוברים", tab: "מלאי", icon: Ticket, roles: ["admin", "branch", "supervisor", "viewer"] },
  { to: "/allocations", label: "הקצאות לסניפים", icon: Waypoints, roles: ["admin", "viewer"] },
  { to: "/supervisor", label: "הנפקה לעובד", tab: "הנפקה", icon: UserCheck, roles: ["admin", "branch", "supervisor"] },
  { to: "/produced", label: "שוברים שהופקו", icon: Link2, roles: ["admin", "branch", "supervisor", "viewer"] },
  // Supervisors have no access to reports; branch managers see their branch only (scoped in reports.tsx).
  { to: "/reports", label: "דוחות", tab: "דוחות", icon: BarChart3, roles: ["admin", "branch", "viewer"] },
  { to: "/signatures", label: "ארכיון חתימות", icon: PenLine, roles: ["admin", "branch", "supervisor", "viewer"] },
  { to: "/settings", label: "הגדרות", icon: Settings, roles: ["admin", "viewer"] },
];

const SHELL_BG = "radial-gradient(120% 60% at 100% 0%, rgba(31,95,208,0.35), transparent 60%)";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? "").slice(0, 2)) || "?";
}

/**
 * InternalLayout — app shell for every signed-in page (design: Main.dc.html).
 * Desktop (≥900px): navy sidebar (white logo, caption, nav, user footer) + light breadcrumb bar.
 * Mobile (<900px): navy sticky top bar (menu · logo · bell), slide-in drawer, fixed bottom tab bar.
 * `title` is the page name shown in the breadcrumb; pages render their own <PageHero> (h1) as the first child.
 */
export function InternalLayout({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const { profile } = useAuthContext();
  const canSimulate = useIsSuperAdmin();
  const navigate = useNavigate();

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

  // Drawer: close on Escape and on navigation; lock page scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

  const items = navItems.filter((item) => item.roles.includes(role));
  const tabs = items.filter((item) => item.tab);
  const name = userDisplayName(profile);
  const accountRole = (profile?.role as Role | undefined) ?? role;
  const roleText = roleLabels[accountRole] ?? "";
  const isActive = (to: NavTo) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));
  const logout = () => void signOut().then(() => navigate({ to: "/login", replace: true }));

  const roleSelect = canSimulate ? (
    <label className="relative flex items-center">
      <span className="sr-only">תפקיד לצפייה</span>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        aria-label="תפקיד לצפייה"
        className="h-9 rounded-[10px] border border-slate-200 bg-white px-3 text-xs font-semibold text-ink-soft outline-none focus-visible:shadow-focus-mint"
      >
        {(Object.keys(roleLabels) as Role[]).map((r) => (
          <option key={r} value={r}>
            תצוגה: {roleLabels[r]}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  const bell = (dark: boolean) => (
    <button type="button" aria-label="התראות" className={cn("ds-iconbtn", dark && "is-dark")}>
      <Bell className="size-[18px]" aria-hidden />
    </button>
  );

  return (
    <div dir="rtl" className="flex min-h-screen w-full bg-page text-navy-900">
      <RealtimeNotifications />

      {/* ── Desktop sidebar ── */}
      <aside
        className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col gap-[22px] overflow-y-auto bg-shell px-4 pb-[22px] pt-[26px] text-white min-[900px]:flex"
        style={{ backgroundImage: SHELL_BG }}
      >
        <Link to="/" activeOptions={{ exact: true }} aria-label="רשף ביטחון — דף הבית" className="flex justify-center border-b border-white/[.08] px-2.5 pb-3.5 pt-1.5">
          <Logo variant="reversed" className="h-[92px]" alt="רשף ביטחון" />
        </Link>
        <div className="px-3.5 text-center text-[15px] font-bold tracking-[.08em] text-shell-text">מערכת לניהול שוברי דלק</div>
        <nav aria-label="ניווט ראשי" className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} activeOptions={{ exact: to === "/" }} className="ds-navlink" aria-current={isActive(to) ? "page" : undefined}>
              <Icon className="size-5 shrink-0" strokeWidth={1.8} aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-1.5 pt-4">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl text-[15px] font-extrabold"
            style={{ background: "linear-gradient(135deg, #45cdba, #1f5fd0)" }}
          >
            {initials(name)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-bold">{name}</span>
            <span className="truncate text-xs text-shell-muted">{roleText}</span>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="יציאה מהמערכת"
            title="יציאה מהמערכת"
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] bg-white/[.06] text-shell-text hover:bg-white/[.12] hover:text-white focus-visible:shadow-focus-mint focus-visible:outline-none"
          >
            <LogOut className="size-[18px]" aria-hidden />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Mobile top bar ── */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-shell px-3.5 py-2.5 text-white shadow-topbar min-[900px]:hidden"
          style={{ backgroundImage: "radial-gradient(120% 140% at 100% 0%, rgba(31,95,208,0.45), transparent 60%)" }}
        >
          <button type="button" className="ds-iconbtn is-dark" aria-label="פתיחת תפריט" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu className="size-5" aria-hidden />
          </button>
          <Link to="/" activeOptions={{ exact: true }} aria-label="רשף ביטחון — דף הבית">
            <Logo variant="reversed" className="h-[42px]" alt="רשף ביטחון" />
          </Link>
          {bell(true)}
        </header>

        {/* ── Mobile drawer ── */}
        {open ? (
          <div className="fixed inset-0 z-50 min-[900px]:hidden">
            <button type="button" aria-label="סגירת תפריט" onClick={() => setOpen(false)} className="absolute inset-0 cursor-pointer bg-navy-900/55" />
            <nav
              aria-label="תפריט ראשי"
              className="ds-drawer-in absolute inset-y-0 right-0 flex w-[82%] max-w-[320px] flex-col gap-1.5 overflow-y-auto bg-shell px-3.5 py-5 text-white shadow-[-20px_0_40px_rgba(0,0,0,0.3)]"
              style={{ backgroundImage: "radial-gradient(120% 50% at 100% 0%, rgba(31,95,208,0.4), transparent 60%)" }}
            >
              <div className="mb-2 flex items-center justify-between border-b border-white/10 px-1 pb-4">
                <Logo variant="reversed" className="h-14" alt="רשף ביטחון" />
                <button type="button" className="ds-iconbtn is-dark" aria-label="סגירה" onClick={() => setOpen(false)}>
                  <X className="size-[18px]" aria-hidden />
                </button>
              </div>
              {items.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} activeOptions={{ exact: to === "/" }} className="ds-navlink" aria-current={isActive(to) ? "page" : undefined} onClick={() => setOpen(false)}>
                  <Icon className="size-5 shrink-0" strokeWidth={1.8} aria-hidden />
                  {label}
                </Link>
              ))}
              <div className="mt-auto flex flex-col gap-3 border-t border-white/10 px-1.5 pt-3.5">
                {roleSelect}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-bold">{name}</span>
                    <span className="truncate text-xs text-shell-muted">{roleText}</span>
                  </div>
                  <button type="button" onClick={logout} className="ds-navlink cursor-pointer border-0 bg-transparent px-3 py-2 text-[13.5px]">
                    <LogOut className="size-4" aria-hidden />
                    יציאה
                  </button>
                </div>
              </div>
            </nav>
          </div>
        ) : null}

        {/* ── Desktop breadcrumb bar ── */}
        <header className="hidden flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-8 py-3.5 min-[900px]:flex">
          <nav aria-label="פירורי לחם" className="flex items-center gap-2 text-[13.5px] text-slate-600">
            <Link to="/" activeOptions={{ exact: true }} className="text-slate-600 no-underline hover:text-navy-900">רשף ביטחון</Link>
            <ChevronLeft className="size-3.5" aria-hidden />
            <span aria-current="page" className="font-semibold text-navy-900">{title}</span>
          </nav>
          <div className="flex items-center gap-2.5">
            {roleSelect}
            {bell(false)}
          </div>
        </header>

        <main className="flex w-full min-w-0 max-w-[1320px] flex-1 flex-col gap-[22px] px-3.5 pb-24 pt-4 min-[900px]:px-8 min-[900px]:pb-10 min-[900px]:pt-[26px]">
          {children}
          <footer className="mt-auto hidden items-center justify-center gap-2.5 pt-1.5 text-[12.5px] text-slate-400 min-[900px]:flex">
            <Logo variant="emblem" alt="" aria-hidden className="h-5 opacity-80" />
            <span>רשף ביטחון · מערכת ניהול שוברי דלק</span>
          </footer>
        </main>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      {tabs.length ? (
        <nav
          aria-label="ניווט מהיר"
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/[.08] bg-shell px-1.5 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(11,17,64,0.25)] min-[900px]:hidden"
        >
          {tabs.map(({ to, tab, icon: Icon }) => (
            <Link key={to} to={to} activeOptions={{ exact: to === "/" }} className="ds-tabitem" aria-current={isActive(to) ? "page" : undefined}>
              <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden />
              {tab}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
