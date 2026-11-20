"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { redeployProject } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 3_000;

type JobStatus = "pending" | "running" | "succeeded" | "failed";

type JobPollResponse =
  | { ok: true; data: { job: { status: JobStatus; error: string | null } } }
  | { ok: false; error: string };

/**
 * "Redeploy" button (PROJECT.md §6, M4). Queues a `trigger_deploy` job, then
 * polls `GET /api/jobs/{id}` until the worker finishes and refreshes the page.
 */
export function RedeployButton({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store",
        });
        const json = (await response.json()) as JobPollResponse;
        if (!active) return;

        if (!json.ok) {
          setError(json.error);
          timer = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }

        const job = json.data.job;
        setStatus(job.status);
        setError(job.error);

        if (job.status === "pending" || job.status === "running") {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setJobId(null);
          router.refresh();
        }
      } catch {
        if (!active) return;
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, router]);

  function onClick() {
    setError(null);
    setStatus("pending");
    startTransition(async () => {
      const result = await redeployProject(projectId);
      if (!result.ok) {
        setError(result.error);
        setStatus(null);
        return;
      }
      setJobId(result.data.jobId);
    });
  }

  const busy = pending || jobId !== null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={onClick} disabled={disabled || busy}>
        {busy ? "Deploying…" : "Redeploy"}
      </Button>
      {error ? (
        <p
          role="alert"
          className="max-w-xs text-right text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
      {!error && status === "succeeded" ? (
        <p className="text-xs text-muted-foreground">Deployment succeeded.</p>
      ) : null}
    </div>
  );
}
