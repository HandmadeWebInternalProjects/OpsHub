import Link from "next/link";
import { asc, ne } from "drizzle-orm";

import { ProjectForm } from "@/components/projects/project-form";
import { ProvisionWizard } from "@/components/wizard/provision-wizard";
import { db } from "@/lib/db";
import { clients, servers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * `/projects/new` — the M3 provisioning wizard. The plain M1 form is kept for
 * projects that should not create a Ploi site, behind `?manual=1`.
 */
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; manual?: string }>;
}) {
  const { clientId, manual } = await searchParams;
  const isManual = manual === "1";

  const clientRows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(ne(clients.status, "archived"))
    .orderBy(asc(clients.name));

  const serverRows = await db
    .select({
      ploiServerId: servers.ploiServerId,
      name: servers.name,
      ipAddress: servers.ipAddress,
    })
    .from(servers)
    .orderBy(asc(servers.name));

  const toggleParams = new URLSearchParams();
  if (!isManual) toggleParams.set("manual", "1");
  if (clientId) toggleParams.set("clientId", clientId);
  const toggleHref = `/projects/new${
    toggleParams.size > 0 ? `?${toggleParams.toString()}` : ""
  }`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/projects"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Projects
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">New project</h1>
          <Link
            href={toggleHref}
            className="text-sm text-muted-foreground hover:underline"
          >
            {isManual
              ? "Use the provisioning wizard"
              : "Create without provisioning"}
          </Link>
        </div>
      </div>

      {isManual ? (
        <ProjectForm
          clients={clientRows}
          defaultValues={{ clientId: clientId ?? "" }}
        />
      ) : (
        <ProvisionWizard
          clients={clientRows}
          servers={serverRows}
          defaultClientId={clientId}
        />
      )}
    </div>
  );
}
