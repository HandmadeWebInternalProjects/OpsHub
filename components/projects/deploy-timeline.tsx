import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeployEvent } from "@/lib/db/schema";

const EVENT_LABELS: Record<string, string> = {
  deploy_started: "Deployment started",
  deploy_completed: "Deployment completed",
  deploy_failed: "Deployment failed",
};

function formatTimestamp(value: Date): string {
  return `${value.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/** Last 20 deploy events for a project, newest first (PROJECT.md §6, M4). */
export function DeployTimeline({ events }: { events: DeployEvent[] }) {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Deploy timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No deployments recorded yet.
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
                      event.event === "deploy_failed"
                        ? "text-sm font-medium text-destructive"
                        : "text-sm font-medium"
                    }
                  >
                    {EVENT_LABELS[event.event] ?? event.event}
                  </span>
                  <time
                    dateTime={event.occurredAt.toISOString()}
                    className="text-xs text-muted-foreground"
                  >
                    {formatTimestamp(event.occurredAt)}
                  </time>
                </div>
                {event.message ? (
                  <p className="break-words text-xs text-muted-foreground">
                    {event.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
