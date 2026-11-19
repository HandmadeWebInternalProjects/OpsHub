"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 3_000;

type JobStatus = "pending" | "running" | "succeeded" | "failed";

type JobPollData = {
  job: {
    id: string;
    type: string;
    status: JobStatus;
    attempts: number;
    error: string | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  project: {
    id: string;
    status: string;
    domain: string;
    ploiSiteId: number | null;
  } | null;
};

const STEPS = [
  { key: "queued", label: "Queued" },
  { key: "creating", label: "Creating site on Ploi" },
  { key: "deploying", label: "Deploying" },
  { key: "live", label: "Live" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** Map the job + project state onto which wizard step is current. */
function currentStepKey(data: JobPollData | null): StepKey {
  if (!data) return "queued";
  const { job, project } = data;
  if (job.status === "failed") return "creating";
  if (job.status === "succeeded" || project?.status === "live") return "live";
  if (project?.status === "deploying" || project?.status === "failed") {
    return "deploying";
  }
  if (job.status === "running" && project) return "creating";
  return "queued";
}

export function JobProgress({
  jobId,
  projectId,
}: {
  jobId: string;
  projectId: string;
}) {
  const [data, setData] = useState<JobPollData | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store",
        });
        const json = (await response.json()) as
          { ok: true; data: JobPollData } | { ok: false; error: string };
        if (!active) return;

        if (!json.ok) {
          setPollError(json.error);
          timer = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }

        setPollError(null);
        setData(json.data);

        const finished =
          json.data.job.status === "succeeded" ||
          json.data.job.status === "failed";
        if (!finished) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!active) return;
        setPollError("Could not reach OpsHub. Retrying…");
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  const activeIndex = STEPS.findIndex(
    (step) => step.key === currentStepKey(data),
  );
  const failed = data?.job.status === "failed";
  const succeeded = data?.job.status === "succeeded";

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>
          {failed
            ? "Provisioning failed"
            : succeeded
              ? "Provisioning complete"
              : "Provisioning…"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol className="flex flex-col gap-2">
          {STEPS.map((step, index) => {
            const done = succeeded || index < activeIndex;
            const current = !failed && !succeeded && index === activeIndex;
            return (
              <li key={step.key} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[10px]",
                    done && "border-primary bg-primary text-primary-foreground",
                    current && "border-primary text-primary",
                    !done &&
                      !current &&
                      "border-muted-foreground/40 text-muted-foreground",
                  )}
                >
                  {done ? "✓" : index + 1}
                </span>
                <span
                  className={cn(
                    current && "font-medium",
                    !done && !current && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
                {current ? (
                  <span
                    aria-hidden
                    className="animate-pulse text-muted-foreground"
                  >
                    …
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>

        {data?.job.status === "pending" ? (
          <p className="text-sm text-muted-foreground">
            Waiting for the worker to pick up the job.
          </p>
        ) : null}

        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            {data?.job.error ?? "The provisioning job failed."}
          </p>
        ) : null}

        {pollError ? (
          <p role="alert" className="text-sm text-destructive">
            {pollError}
          </p>
        ) : null}

        {succeeded ? (
          <div>
            <Link
              href={`/projects/${projectId}`}
              className={cn(buttonVariants())}
            >
              Open project
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
