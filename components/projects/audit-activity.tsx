import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuditSummary } from "@/lib/db/schema";

const EVENT_LABELS: Record<string, string> = {
  login_failed: "Login failed",
  login_success: "Login succeeded",
  logout: "Logout",
  content_deleted: "Content deleted",
  content_created: "Content created",
  content_updated: "Content updated",
  permission_changed: "Permission changed",
  access_denied: "Access denied",
};

const FAILURE_EVENTS = new Set([
  "login_failed",
  "access_denied",
  "permission_changed",
]);

function formatTimestamp(value: Date): string {
  return `${value.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/** Last 20 audit events for a project, newest first (PROJECT.md §6, M7). */
export function AuditActivity({ events }: { events: AuditSummary[] }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Recent security activity</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No audit events yet. Set the project’s CMS URL and audit token in
            Settings.
          </p>
        ) : (
          <ol className="flex flex-col">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-1 border-b py-2 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-4">
                  <span
                    className={
                      FAILURE_EVENTS.has(event.eventType)
                        ? "text-sm font-medium text-destructive"
                        : "text-sm font-medium"
                    }
                  >
                    {EVENT_LABELS[event.eventType] ?? event.eventType}
                  </span>
                  <time
                    dateTime={event.capturedAt.toISOString()}
                    className="text-xs text-muted-foreground"
                  >
                    {formatTimestamp(event.capturedAt)}
                  </time>
                </div>
                <p className="break-words text-xs text-muted-foreground">
                  {event.summary}
                  {event.actor ? ` — ${event.actor}` : ""}
                  {event.ipAddress ? ` (${event.ipAddress})` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
