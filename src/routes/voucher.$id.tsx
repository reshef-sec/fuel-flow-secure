import { createFileRoute, redirect } from "@tanstack/react-router";

/** Links sent before the move to /v/:token keep working. */
export const Route = createFileRoute("/voucher/$id")({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/v/$token", params: { token: params.id }, search, replace: true });
  },
  validateSearch: (search: Record<string, unknown>) => search as { demo?: 1 },
});
