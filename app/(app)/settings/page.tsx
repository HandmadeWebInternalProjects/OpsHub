import Link from "next/link";

import { AuditSyncButton } from "@/components/settings/audit-sync-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function configured(value: string | undefined): string {
  return value ? "Configured" : "Not set";
}

/** Platform-level settings: integration status (from env) and global actions. */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Platform configuration and integration status. Per-project settings
          live on each project (Integrations and Alert rules tabs).
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Integration status</CardTitle>
          <CardDescription>
            Values come from the environment. Secrets are never displayed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          <StatusRow
            label="Data source"
            value={env.USE_MOCKS ? "Mock adapters (USE_MOCKS)" : "Live"}
          />
          <StatusRow
            label="Ploi API token"
            value={configured(env.PLOI_API_TOKEN)}
          />
          <StatusRow label="Ploi API base" value={env.PLOI_API_BASE} />
          <StatusRow
            label="Ploi webhook secret"
            value={configured(env.PLOI_WEBHOOK_SECRET)}
          />
          <StatusRow
            label="Lighthouse webhook secret"
            value={configured(env.LIGHTHOUSE_WEBHOOK_SECRET)}
          />
          <StatusRow
            label="Default alert webhook"
            value={configured(env.SLACK_WEBHOOK_URL)}
          />
          <StatusRow
            label="Resend API key"
            value={configured(env.RESEND_API_KEY)}
          />
          <StatusRow label="Alert email from" value={env.ALERT_EMAIL_FROM} />
          <StatusRow
            label="Worker poll interval"
            value={`${env.WORKER_POLL_INTERVAL_MS} ms`}
          />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Global actions</CardTitle>
          <CardDescription>
            Fleet-wide operations. The worker performs the actual work, so run
            it alongside the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AuditSyncButton />
          <p className="text-sm text-muted-foreground">
            Alert rules, including fleet-wide ones, are managed under{" "}
            <Link href="/alerts/rules" className="text-primary hover:underline">
              Alerts → Rules
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
