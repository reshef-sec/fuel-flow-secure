/**
 * Same-origin client for the Express + MongoDB backend (server/app.js).
 *
 * Keeps the call shape of the former supabase-js client so existing call sites only
 * change their import: api.from(table).select().eq()…, api.rpc(name, params).
 * Every query is a thenable resolving to { data, error } and never throws.
 * The session lives in an httpOnly cookie — the browser never sees a token.
 */

export interface ApiError { message: string; code: string | null; status?: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ApiResult<T = any> { data: T | null; error: ApiError | null }

/* ---------- auth change events (login / logout / password change / expired session) ---------- */
type Listener = () => void;
const authListeners = new Set<Listener>();
export function emitAuthChange() {
  authListeners.forEach((l) => l());
}
export function onAuthChange(l: Listener) {
  authListeners.add(l);
  return () => void authListeners.delete(l);
}

/** Low-level JSON call. Resolves with the parsed body or a normalized error; never throws. */
export async function apiFetch<T = unknown>(
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<{ status: number; body: T | null; error: ApiError | null }> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: method === "GET" ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* empty / non-JSON body */ }
    if (!res.ok) {
      const b = (body ?? {}) as { error?: string; code?: string | null };
      // Session expired or revoked mid-use: let useAuth re-check /me (redirects to /login).
      if (res.status === 401 && !path.startsWith("/api/auth/")) emitAuthChange();
      return { status: res.status, body: null, error: { message: b.error || `HTTP ${res.status}`, code: b.code ?? null, status: res.status } };
    }
    return { status: res.status, body: body as T, error: null };
  } catch (e) {
    return { status: 0, body: null, error: { message: e instanceof Error ? e.message : "שגיאת רשת", code: null, status: 0 } };
  }
}

type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is";
interface Filter { col: string; op: FilterOp; value: unknown }
type Op = "select" | "insert" | "update" | "upsert" | "delete";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class QueryBuilder<T = any> implements PromiseLike<ApiResult<T>> {
  private op: Op = "select";
  private columns?: string;
  private filters: Filter[] = [];
  private orderBy?: { col: string; asc: boolean };
  private rangeArg?: [number, number];
  private limitArg?: number;
  private values?: unknown;
  private onConflict?: string;
  private singleMode: "none" | "maybe" | "one" = "none";

  private readonly table: string;
  // No parameter properties: the file must stay erasable for Node type stripping (tests).
  constructor(table: string) { this.table = table; }

  select(columns = "*") {
    // After a write, .select() would ask for returned rows; the backend returns none.
    if (this.op === "select") this.columns = columns.replace(/\s+/g, "");
    return this;
  }
  insert(values: unknown) { this.op = "insert"; this.values = values; return this; }
  update(values: unknown) { this.op = "update"; this.values = values; return this; }
  upsert(values: unknown, opts?: { onConflict?: string }) {
    this.op = "upsert"; this.values = values; this.onConflict = opts?.onConflict; return this;
  }
  delete() { this.op = "delete"; return this; }

  private f(col: string, op: FilterOp, value: unknown) { this.filters.push({ col, op, value }); return this; }
  eq(col: string, value: unknown) { return this.f(col, "eq", value); }
  neq(col: string, value: unknown) { return this.f(col, "neq", value); }
  gt(col: string, value: unknown) { return this.f(col, "gt", value); }
  gte(col: string, value: unknown) { return this.f(col, "gte", value); }
  lt(col: string, value: unknown) { return this.f(col, "lt", value); }
  lte(col: string, value: unknown) { return this.f(col, "lte", value); }
  in(col: string, values: readonly unknown[]) { return this.f(col, "in", [...values]); }
  is(col: string, value: null | boolean) { return this.f(col, "is", value); }

  order(col: string, opts?: { ascending?: boolean }) { this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
  range(from: number, to: number) { this.rangeArg = [from, to]; return this; }
  limit(n: number) { this.limitArg = n; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "one"; return this; }

  private async execute(): Promise<ApiResult<T>> {
    const body: Record<string, unknown> = { op: this.op, filters: this.filters };
    if (this.op === "select") {
      if (this.columns) body.columns = this.columns;
      if (this.orderBy) body.order = this.orderBy;
      if (this.rangeArg) body.range = this.rangeArg;
      const limit = this.singleMode !== "none" ? Math.min(this.limitArg ?? 2, 2) : this.limitArg;
      if (limit !== undefined) body.limit = limit;
    } else {
      body.values = this.values;
      if (this.onConflict) body.onConflict = this.onConflict;
    }
    const { body: res, error } = await apiFetch<{ data: unknown }>(`/api/db/${encodeURIComponent(this.table)}`, { body });
    if (error) return { data: null, error };
    const data = res?.data ?? null;
    if (this.singleMode !== "none") {
      const rows = Array.isArray(data) ? data : [];
      if (rows.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      if (rows.length === 0 && this.singleMode === "one") return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      return { data: (rows[0] ?? null) as T, error: null };
    }
    return { data: data as T, error: null };
  }

  then<R1 = ApiResult<T>, R2 = never>(
    onfulfilled?: ((value: ApiResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/** Calls a server-side RPC (former Postgres function) with the same p_* params. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc<T = any>(name: string, params: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  const { body, error } = await apiFetch<{ data: T }>(`/api/rpc/${encodeURIComponent(name)}`, { body: params });
  if (error) return { data: null, error };
  return { data: (body?.data ?? null) as T | null, error: null };
}

export const api = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: <T = any>(table: string) => new QueryBuilder<T>(table),
  rpc,
};

export type { QueryBuilder };
