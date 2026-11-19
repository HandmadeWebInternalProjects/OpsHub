import { desc } from "drizzle-orm";

import { SyncNowButton } from "@/components/servers/sync-now-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { servers } from "@/lib/db/schema";
import { ploiMonitoredServerSchema } from "@/lib/ploi";

export const dynamic = "force-dynamic";

function latestStatistic(raw: unknown) {
  const parsed = ploiMonitoredServerSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.statistics.at(-1) ?? null;
}

function statValue(value: string | null | undefined, suffix = "") {
  return value ? `${value}${suffix}` : "\u2014";
}

function syncedAt(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default async function ServersPage() {
  const rows = await db
    .select()
    .from(servers)
    .orderBy(desc(servers.lastSyncedAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Servers</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "server" : "servers"} cached from
            Ploi
          </p>
        </div>
        <SyncNowButton />
      </div>

      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>RAM</TableHead>
              <TableHead>Disk</TableHead>
              <TableHead>Load</TableHead>
              <TableHead>Last synced</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No servers cached yet. Click “Sync now” to pull from Ploi.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((server) => {
                const latest = latestStatistic(server.rawJson);
                return (
                  <TableRow key={server.id}>
                    <TableCell className="font-medium">{server.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {server.ipAddress || "\u2014"}
                    </TableCell>
                    <TableCell>{statValue(latest?.cpu, "%")}</TableCell>
                    <TableCell>{statValue(latest?.ram, "%")}</TableCell>
                    <TableCell>{statValue(latest?.disk, "%")}</TableCell>
                    <TableCell>{statValue(latest?.load_average)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {syncedAt(server.lastSyncedAt)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
