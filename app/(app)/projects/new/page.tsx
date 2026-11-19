import Link from "next/link";
import { asc, ne } from "drizzle-orm";

import { ProjectForm } from "@/components/projects/project-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;

  const clientRows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(ne(clients.status, "archived"))
    .orderBy(asc(clients.name));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold">New project</h1>
      </div>

      {clientRows.length === 0 ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>No clients yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Create a{" "}
            <Link href="/clients/new" className="underline">
              client
            </Link>{" "}
            before adding a project.
          </CardContent>
        </Card>
      ) : (
        <ProjectForm
          clients={clientRows}
          defaultValues={{ clientId: clientId ?? "" }}
        />
      )}
    </div>
  );
}
