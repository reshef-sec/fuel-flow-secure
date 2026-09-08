import type { LucideIcon } from "lucide-react";

import { InternalLayout } from "./InternalLayout";
import { Card } from "@/design-system/delek-1ea111";

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <InternalLayout title={title}>
      <Card className="flex flex-col items-center gap-4 py-16 text-center" padding="lg">
        <span className="grid size-14 place-items-center rounded-xl bg-blue-100 text-blue-700">
          <Icon className="size-7" />
        </span>
        <h2 className="font-display text-xl font-extrabold text-secondary">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </Card>
    </InternalLayout>
  );
}
