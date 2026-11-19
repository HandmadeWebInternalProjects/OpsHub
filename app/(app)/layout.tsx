import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { auth } from "@/lib/auth";

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

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-4 border-b px-6">
          <UserMenu name={name} email={email} role={session.user.role} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
