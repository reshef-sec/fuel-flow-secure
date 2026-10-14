import { createFileRoute, redirect } from "@tanstack/react-router";

// The import tools moved to Settings → "ייבוא וטעינת שוברים". Keep the old URL working.
export const Route = createFileRoute("/vouchers")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { tab: "import" } as never, replace: true });
  },
});
