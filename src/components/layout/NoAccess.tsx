import { ShieldAlert } from "lucide-react";

import { InternalLayout } from "@/components/layout/InternalLayout";
import { Card } from "@/design-system/delek-1ea111";

/** Shown when the current role is not permitted to view a page. */
export function NoAccess({ title }: { title: string }) {
  return (
    <InternalLayout title={title}>
      <Card padding="lg" className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-muted text-secondary">
          <ShieldAlert className="size-6" />
        </span>
        <div>
          <p className="font-display text-lg font-extrabold text-secondary">אין הרשאה לצפייה</p>
          <p className="text-sm text-muted-foreground">
            הרשאות התפקיד שלך אינן מאפשרות גישה למסך זה. יש לפנות לאדמין מרכזי.
          </p>
        </div>
      </Card>
    </InternalLayout>
  );
}
