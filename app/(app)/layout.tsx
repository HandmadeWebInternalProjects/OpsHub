import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { alerts } from "@/lib/db/schema";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const email = session.user.email ?? "user@opshub.local";
  const name = session.user.name ?? email.split("@")[0];

  const [openAlerts] = await db
    .select({ value: count() })
    .from(alerts)
    .where(eq(alerts.status, "open"));
  const alertCount = Number(openAlerts?.value ?? 0);

  return (
    <div className="flex min-h-screen">
      <AppSidebar alertCount={alertCount} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-4 border-b px-6">
          <UserMenu name={name} email={email} role={session.user.role} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
