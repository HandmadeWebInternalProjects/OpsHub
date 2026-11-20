import { count, eq } from "drizzle-orm";

import { AlertsTabs } from "@/components/alerts/alerts-tabs";
import { db } from "@/lib/db";
import { alerts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Alerts header + tab navigation; tab pages render as children. */
export default async function AlertsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [row] = await db
    .select({ value: count() })
    .from(alerts)
    .where(eq(alerts.status, "open"));
  const openCount = Number(row?.value ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          {openCount} open. Fired alerts and the rules that produce them.
        </p>
      </div>
      <AlertsTabs />
      {children}
    </div>
  );
}
