import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { PloiLinkForm } from "@/components/projects/ploi-link-form";
import { CmsTokenForm } from "@/components/settings/cms-token-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { projects, servers } from "@/lib/db/schema";
import {
  cmsTokenKey,
  listIntegrationConfigKeys,
} from "@/lib/integration-config";

export const dynamic = "force-dynamic";

/** Project Integrations tab: Ploi link and the CMS audit token. */
export default async function ProjectIntegrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    notFound();
  }

  const [ploiServers, configuredKeys] = await Promise.all([
    db
      .select({
        ploiServerId: servers.ploiServerId,
        name: servers.name,
        ipAddress: servers.ipAddress,
      })
      .from(servers)
      .orderBy(asc(servers.name)),
    listIntegrationConfigKeys(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Ploi infrastructure</CardTitle>
          <CardDescription>
            Link this project to an existing Ploi server and site.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PloiLinkForm
            projectId={project.id}
            servers={ploiServers}
            defaultServerId={project.ploiServerId}
            defaultSiteId={project.ploiSiteId}
          />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Content-backend audit</CardTitle>
          <CardDescription>
            OpsHub pulls recent audit events from this project&rsquo;s content
            backend every 15 minutes. Set the project&rsquo;s CMS URL on the
            Overview tab, then store its audit token here. The token is
            encrypted at rest and never shown again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CmsTokenForm
            projectId={project.id}
            cmsType={project.cmsType}
            hasToken={configuredKeys.has(cmsTokenKey(project.id))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
